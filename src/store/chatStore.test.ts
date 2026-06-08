// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { migratePersistedState, useChatStore } from "@/store/chatStore";

const store = () => useChatStore.getState();

describe("migratePersistedState", () => {
  it("passes pre-versioning (v0) state through untouched", () => {
    const saved = { chats: {}, activeChatId: "x", codingMode: false };
    // Same reference back — no migration, nothing discarded.
    expect(migratePersistedState(saved, 0)).toBe(saved);
  });

  it("passes an unknown future version through (default branch)", () => {
    const saved = { chats: {}, activeChatId: "y", codingMode: true };
    expect(migratePersistedState(saved, 99)).toBe(saved);
  });
});

describe("chat management actions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("createChat adds a chat and makes it active", () => {
    const before = Object.keys(store().chats).length;
    const id = store().createChat({ title: "Test chat" });
    expect(Object.keys(store().chats).length).toBe(before + 1);
    expect(store().activeChatId).toBe(id);
    expect(store().chats[id].title).toBe("Test chat");
  });

  it("renameChat updates the title but ignores empty/whitespace", () => {
    const id = store().createChat();
    store().renameChat(id, "  Renamed  ");
    expect(store().chats[id].title).toBe("Renamed");
    store().renameChat(id, "   ");
    expect(store().chats[id].title).toBe("Renamed"); // unchanged
  });

  it("deleteChat keeps activeChatId pointing at a real chat", () => {
    const a = store().createChat({ title: "A" });
    store().createChat({ title: "B" }); // active = B
    store().deleteChat(store().activeChatId); // delete the active one
    expect(store().chats[store().activeChatId]).toBeDefined();
    expect(store().chats[a]).toBeDefined();
  });

  it("recreates a fresh chat when the last one is deleted", () => {
    // Delete every chat; the store must never end up empty.
    for (const id of Object.keys(store().chats)) store().deleteChat(id);
    expect(Object.keys(store().chats).length).toBe(1);
    expect(store().chats[store().activeChatId]).toBeDefined();
  });

  it("loadDemoChat adds a branching demo and switches to it", () => {
    const id = store().loadDemoChat();
    const chat = store().chats[id];
    expect(store().activeChatId).toBe(id);
    // The demo has a branch point (a node with >= 2 children).
    const hasBranch = Object.values(chat.nodes).some(
      (n) => n.childrenIds.length >= 2,
    );
    expect(hasBranch).toBe(true);
  });

  it("openNode switches chat, selects the node, and sets a focus request", () => {
    const id = store().loadDemoChat();
    const chat = store().chats[id];
    const someNode = Object.values(chat.nodes).find((n) => n.parentId)!;
    store().createChat(); // move active away from the demo
    store().openNode(id, someNode.id);
    expect(store().activeChatId).toBe(id);
    expect(store().chats[id].selectedNodeId).toBe(someNode.id);
    expect(store().focusNodeRequest).toMatchObject({
      chatId: id,
      nodeId: someNode.id,
    });
  });
});
