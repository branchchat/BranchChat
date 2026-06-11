// @vitest-environment jsdom
//
// Server-side sync engine: two-way pass with last-write-wins, and the store's
// applySyncedChat upsert. The api module is mocked — these tests cover the
// engine's decisions (what to pull, what to push, what to skip), not HTTP.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { isSyncEnabled, setSyncEnabled, syncNow } from "@/lib/sync";
import { addTombstone } from "@/lib/syncTombstones";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import type { ChatSessionState } from "@/types/chat";

vi.mock("@/lib/api", () => ({
  isBackendConfigured: () => true,
  fetchSyncManifest: vi.fn(),
  fetchSyncedChat: vi.fn(),
  pushSyncedChat: vi.fn(),
  deleteSyncedChat: vi.fn(),
}));

const api = vi.mocked(await import("@/lib/api"));

function makeChat(id: string, title: string, updatedAt: number): ChatSessionState {
  return {
    id,
    title,
    workspace: "personal",
    nodes: {
      root: {
        id: "root",
        parentId: null,
        role: "system",
        content: `system for ${title}`,
        childrenIds: [],
        createdAt: 1,
      },
    },
    rootId: "root",
    selectedNodeId: "root",
    activePath: ["root"],
    collapsedNodeIds: [],
    journalEntries: [],
    createdAt: 1,
    updatedAt,
  };
}

function envelopeFor(chat: ChatSessionState): Record<string, unknown> {
  return { type: "branchchat-session", version: 1, exportedAt: 2, chat };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Set the flag directly: setSyncEnabled(true) would fire its own syncNow()
  // pass that interleaves with the test body.
  localStorage.setItem("branchchat-sync-enabled", "1");
  useChatStore.setState({ chats: {}, activeChatId: "" });
  useAuthStore.setState({
    user: { email: "t@example.com", email_verified: true },
    hydrated: true,
  } as never);
  api.fetchSyncManifest.mockResolvedValue([]);
  api.pushSyncedChat.mockResolvedValue({ status: "stored", updated_at: 0 });
});

describe("syncNow", () => {
  it("pulls a chat the server has newer, keeping its id and remote version", async () => {
    const local = makeChat("chat_a", "old local", 100);
    useChatStore.setState({ chats: { chat_a: local }, activeChatId: "chat_a" });
    const remote = makeChat("chat_a", "newer remote", 200);
    api.fetchSyncManifest.mockResolvedValue([
      { chat_id: "chat_a", title: "newer remote", updated_at: 200 },
    ]);
    api.fetchSyncedChat.mockResolvedValue({
      chat_id: "chat_a",
      title: "newer remote",
      updated_at: 200,
      payload: envelopeFor(remote),
    });

    await syncNow();

    const after = useChatStore.getState().chats.chat_a;
    expect(after.title).toBe("newer remote");
    expect(after.id).toBe("chat_a");
    expect(after.updatedAt).toBe(200); // remote stamp kept → no echo push
    // Nothing was newer locally, so nothing pushed.
    expect(api.pushSyncedChat).not.toHaveBeenCalled();
  });

  it("pushes chats that are newer locally or missing on the server", async () => {
    useChatStore.setState({
      chats: {
        chat_new: makeChat("chat_new", "never synced", 50),
        chat_stale: makeChat("chat_stale", "local newer", 300),
      },
      activeChatId: "chat_new",
    });
    api.fetchSyncManifest.mockResolvedValue([
      { chat_id: "chat_stale", title: "local newer", updated_at: 250 },
    ]);

    await syncNow();

    const pushedIds = api.pushSyncedChat.mock.calls.map((c) => c[0]).sort();
    expect(pushedIds).toEqual(["chat_new", "chat_stale"]);
    expect(api.fetchSyncedChat).not.toHaveBeenCalled();
  });

  it("skips chats that match the server version", async () => {
    useChatStore.setState({
      chats: { chat_a: makeChat("chat_a", "same", 100) },
      activeChatId: "chat_a",
    });
    api.fetchSyncManifest.mockResolvedValue([
      { chat_id: "chat_a", title: "same", updated_at: 100 },
    ]);

    await syncNow();

    expect(api.fetchSyncedChat).not.toHaveBeenCalled();
    expect(api.pushSyncedChat).not.toHaveBeenCalled();
  });

  it("deletes the server copy of a tombstoned chat and never re-pulls it", async () => {
    // The chat is gone locally and tombstoned; the server still has it.
    addTombstone("chat_x");
    api.fetchSyncManifest.mockResolvedValue([
      { chat_id: "chat_x", title: "deleted", updated_at: 100 },
    ]);

    await syncNow();

    expect(api.deleteSyncedChat).toHaveBeenCalledWith("chat_x");
    // Not restored into the store, and not downloaded.
    expect(api.fetchSyncedChat).not.toHaveBeenCalled();
    expect(useChatStore.getState().chats.chat_x).toBeUndefined();
  });

  it("does nothing when disabled or signed out", async () => {
    localStorage.setItem("branchchat-sync-enabled", "0");
    await syncNow();
    expect(api.fetchSyncManifest).not.toHaveBeenCalled();

    localStorage.setItem("branchchat-sync-enabled", "1");
    useAuthStore.setState({ user: null } as never);
    await syncNow();
    expect(api.fetchSyncManifest).not.toHaveBeenCalled();
  });
});

describe("setSyncEnabled / isSyncEnabled", () => {
  it("persists the flag", () => {
    setSyncEnabled(false);
    expect(isSyncEnabled()).toBe(false);
    setSyncEnabled(true);
    expect(isSyncEnabled()).toBe(true);
  });
});

describe("chatStore.applySyncedChat", () => {
  it("refuses an older remote copy (last-write-wins)", () => {
    useChatStore.setState({
      chats: { chat_a: makeChat("chat_a", "local", 500) },
      activeChatId: "chat_a",
    });
    const applied = useChatStore
      .getState()
      .applySyncedChat(
        "chat_a",
        envelopeFor(makeChat("chat_a", "older remote", 400)),
        400,
      );
    expect(applied).toBe(false);
    expect(useChatStore.getState().chats.chat_a.title).toBe("local");
  });

  it("does not switch the active chat when pulling a different one", () => {
    useChatStore.setState({
      chats: { chat_a: makeChat("chat_a", "active", 100) },
      activeChatId: "chat_a",
    });
    useChatStore
      .getState()
      .applySyncedChat(
        "chat_b",
        envelopeFor(makeChat("chat_b", "pulled", 200)),
        200,
      );
    const state = useChatStore.getState();
    expect(state.activeChatId).toBe("chat_a");
    expect(state.chats.chat_b.title).toBe("pulled");
  });
});
