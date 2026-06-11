// @vitest-environment jsdom
//
// Server-side sync engine: two-way pass with last-write-wins, tombstone
// reconciliation in both directions, and the store's applySyncedChat upsert.
// The api module is mocked — these tests cover the engine's decisions (what
// to pull, push, delete, and resurrect), not HTTP.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncNow } from "@/lib/sync";
import { addTombstone, isTombstoned } from "@/lib/syncTombstones";
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

  it("tombstones the server copy of a locally-deleted chat and never re-pulls it", async () => {
    // The chat is gone locally and tombstoned; the server still has it live.
    addTombstone("chat_x", 100);
    api.fetchSyncManifest.mockResolvedValue([
      { chat_id: "chat_x", title: "deleted", updated_at: 100 },
    ]);

    await syncNow();

    expect(api.deleteSyncedChat).toHaveBeenCalledWith("chat_x");
    // Not restored into the store, and not downloaded.
    expect(api.fetchSyncedChat).not.toHaveBeenCalled();
    expect(useChatStore.getState().chats.chat_x).toBeUndefined();
  });

  it("retires the tombstone and pulls when another device resurrected with newer content", async () => {
    addTombstone("chat_x", 100);
    const reborn = makeChat("chat_x", "edited elsewhere", 250);
    api.fetchSyncManifest.mockResolvedValue([
      { chat_id: "chat_x", title: "edited elsewhere", updated_at: 250 },
    ]);
    api.fetchSyncedChat.mockResolvedValue({
      chat_id: "chat_x",
      title: "edited elsewhere",
      updated_at: 250,
      payload: envelopeFor(reborn),
    });

    await syncNow();

    // The resurrection wins: no re-delete, tombstone gone, chat back.
    expect(api.deleteSyncedChat).not.toHaveBeenCalled();
    expect(isTombstoned("chat_x")).toBe(false);
    expect(useChatStore.getState().chats.chat_x.title).toBe("edited elsewhere");
  });

  it("drops the local copy when the manifest carries a server tombstone", async () => {
    useChatStore.setState({
      chats: {
        chat_dead: makeChat("chat_dead", "deleted on device A", 80),
        chat_live: makeChat("chat_live", "keep me", 10),
      },
      activeChatId: "chat_live",
    });
    api.fetchSyncManifest.mockResolvedValue([
      { chat_id: "chat_dead", title: null, updated_at: 100, deleted: true },
      { chat_id: "chat_live", title: "keep me", updated_at: 10 },
    ]);

    await syncNow();

    const chats = useChatStore.getState().chats;
    expect(chats.chat_dead).toBeUndefined();
    expect(chats.chat_live).toBeDefined();
    // The dead chat must not be pushed back, pulled, or re-deleted.
    expect(api.pushSyncedChat).not.toHaveBeenCalled();
    expect(api.fetchSyncedChat).not.toHaveBeenCalled();
  });

  it("resurrect-pushes a local copy that is strictly newer than the server tombstone", async () => {
    useChatStore.setState({
      chats: { chat_r: makeChat("chat_r", "edited after the delete", 150) },
      activeChatId: "chat_r",
    });
    api.fetchSyncManifest.mockResolvedValue([
      { chat_id: "chat_r", title: null, updated_at: 100, deleted: true },
    ]);

    await syncNow();

    // Local edits win over the tombstone (LWW): kept locally and pushed.
    expect(useChatStore.getState().chats.chat_r).toBeDefined();
    expect(api.pushSyncedChat).toHaveBeenCalledWith(
      "chat_r",
      expect.anything(),
      150,
      "edited after the delete",
    );
  });

  it("drops the local copy when a push answers 'deleted' (raced a delete)", async () => {
    useChatStore.setState({
      chats: {
        chat_raced: makeChat("chat_raced", "raced", 90),
        chat_other: makeChat("chat_other", "other", 10),
      },
      activeChatId: "chat_other",
    });
    api.fetchSyncManifest.mockResolvedValue([]);
    api.pushSyncedChat.mockImplementation(async (id: string) =>
      id === "chat_raced"
        ? { status: "deleted", updated_at: 100 }
        : { status: "stored", updated_at: 0 },
    );

    await syncNow();

    expect(useChatStore.getState().chats.chat_raced).toBeUndefined();
    expect(useChatStore.getState().chats.chat_other).toBeDefined();
  });

  it("does nothing when signed out", async () => {
    useAuthStore.setState({ user: null } as never);
    await syncNow();
    expect(api.fetchSyncManifest).not.toHaveBeenCalled();
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
