// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  migratePersistedState,
  resolveModelForNode,
  useChatStore,
} from "@/store/chatStore";

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

describe("model-specific branches", () => {
  const GEMINI = {
    provider: "gemini",
    model: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
  };
  const CLAUDE = {
    provider: "anthropic",
    model: "claude-fable-5",
    label: "Claude Fable 5",
  };

  beforeEach(() => {
    localStorage.clear();
    store().createChat({ title: "model branches" });
  });

  const activeChat = () => store().chats[store().activeChatId];

  it("branchFromNode stamps the override on the branch's first user node and journals it", () => {
    const root = activeChat().rootId;
    const result = store().branchFromNode(root, "try this with gemini", {
      model: GEMINI,
    })!;

    const userNode = activeChat().nodes[result.userId];
    expect(userNode.modelOverride).toEqual(GEMINI);
    // The loading assistant node carries no override of its own; it INHERITS.
    expect(activeChat().nodes[result.assistantId].modelOverride).toBeUndefined();

    const lastJournal = activeChat().journalEntries.at(-1)!;
    expect(lastJournal.type).toBe("branch");
    expect(lastJournal.message).toContain("Gemini 2.5 Pro");
  });

  it("resolveModelForNode walks up to the nearest ancestor override", () => {
    const root = activeChat().rootId;
    const branch = store().branchFromNode(root, "gemini branch", {
      model: GEMINI,
    })!;

    // The assistant node and any continuation under it inherit the branch model.
    expect(resolveModelForNode(activeChat().nodes, branch.assistantId)).toEqual(
      GEMINI,
    );
    const continuation = store().addUserMessage(
      "continue here",
      branch.assistantId,
    )!;
    expect(
      resolveModelForNode(activeChat().nodes, continuation.assistantId),
    ).toEqual(GEMINI);

    // Nodes outside the branch (the root path) resolve to the app default.
    expect(resolveModelForNode(activeChat().nodes, root)).toBeNull();
  });

  it("nested branches override the outer branch's model", () => {
    const root = activeChat().rootId;
    const gemini = store().branchFromNode(root, "gemini branch", {
      model: GEMINI,
    })!;
    const claude = store().branchFromNode(
      gemini.assistantId,
      "now ask claude",
      { model: CLAUDE },
    )!;

    // Deeper override wins on the nested path…
    expect(resolveModelForNode(activeChat().nodes, claude.assistantId)).toEqual(
      CLAUDE,
    );
    // …while the outer branch keeps its own model.
    expect(resolveModelForNode(activeChat().nodes, gemini.userId)).toEqual(
      GEMINI,
    );
  });

  it("sibling branches do not affect each other's model", () => {
    const root = activeChat().rootId;
    const withModel = store().branchFromNode(root, "model branch", {
      model: CLAUDE,
    })!;
    const plain = store().branchFromNode(root, "plain branch")!;

    expect(
      resolveModelForNode(activeChat().nodes, withModel.assistantId),
    ).toEqual(CLAUDE);
    expect(
      resolveModelForNode(activeChat().nodes, plain.assistantId),
    ).toBeNull();
  });
});

describe("node annotations (tags + comments)", () => {
  beforeEach(() => {
    localStorage.clear();
    store().createChat({ title: "annotations" });
  });

  const activeChat = () => store().chats[store().activeChatId];
  const rootNode = () => activeChat().nodes[activeChat().rootId];

  it("addTag appends, trims, dedupes, and journals", () => {
    const id = rootNode().id;
    store().addTag(id, "  research  ");
    store().addTag(id, "research"); // duplicate — ignored
    store().addTag(id, "   "); // empty — ignored

    expect(activeChat().nodes[id].tags).toEqual(["research"]);
    const j = activeChat().journalEntries.at(-1)!;
    expect(j.type).toBe("tag");
    expect(j.message).toContain("research");
  });

  it("removeTag drops the tag and clears the array when empty", () => {
    const id = rootNode().id;
    store().addTag(id, "a");
    store().addTag(id, "b");
    store().removeTag(id, "a");
    expect(activeChat().nodes[id].tags).toEqual(["b"]);

    store().removeTag(id, "b");
    // Last tag removed → field cleared rather than left as an empty array.
    expect(activeChat().nodes[id].tags).toBeUndefined();
  });

  it("addComment appends a comment with an id; removeComment deletes it", () => {
    const id = rootNode().id;
    store().addComment(id, "  first note  ");
    store().addComment(id, ""); // empty — ignored

    const comments = activeChat().nodes[id].comments!;
    expect(comments).toHaveLength(1);
    expect(comments[0].content).toBe("first note");
    expect(comments[0].id).toBeTruthy();

    store().removeComment(id, comments[0].id);
    expect(activeChat().nodes[id].comments).toBeUndefined();
  });
});
