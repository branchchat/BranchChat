import { describe, expect, it } from "vitest";

import { searchChats } from "@/lib/search";
import type { ChatNode, ChatSessionState } from "@/types/chat";

function node(over: Partial<ChatNode> & { id: string }): ChatNode {
  return {
    parentId: null,
    role: "user",
    content: "",
    childrenIds: [],
    createdAt: 0,
    ...over,
  };
}

function chat(
  id: string,
  updatedAt: number,
  nodes: ChatNode[],
  title = id,
): ChatSessionState {
  return {
    id,
    title,
    workspace: "personal",
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    rootId: nodes[0]?.id ?? "root",
    selectedNodeId: nodes[0]?.id ?? "root",
    activePath: [],
    collapsedNodeIds: [],
    journalEntries: [],
    createdAt: 0,
    updatedAt,
  };
}

const chats = {
  c1: chat("c1", 200, [
    node({ id: "n1", content: "Photosynthesis converts light into energy." }),
    node({ id: "n2", content: "Mitochondria are the powerhouse.", tags: ["bio"] }),
  ]),
  c2: chat("c2", 100, [
    node({
      id: "n3",
      content: "Alternate plan",
      branchLabel: "Food & markets",
    }),
  ]),
};

describe("searchChats", () => {
  it("returns nothing for an empty/whitespace query", () => {
    expect(searchChats(chats, "")).toEqual([]);
    expect(searchChats(chats, "   ")).toEqual([]);
  });

  it("matches node content case-insensitively with a located snippet", () => {
    const [hit] = searchChats(chats, "PHOTOSYNTHESIS");
    expect(hit.nodeId).toBe("n1");
    expect(hit.chatId).toBe("c1");
    // matchStart points at the term within the snippet.
    expect(hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength)).toBe(
      "Photosynthesis",
    );
  });

  it("matches a branch label, flagged with matchStart -1", () => {
    const hits = searchChats(chats, "food");
    expect(hits).toHaveLength(1);
    expect(hits[0].nodeId).toBe("n3");
    expect(hits[0].matchStart).toBe(-1);
    expect(hits[0].branchLabel).toBe("Food & markets");
  });

  it("matches tags", () => {
    const hits = searchChats(chats, "bio");
    expect(hits.map((h) => h.nodeId)).toContain("n2");
  });

  it("scans more-recently-updated chats first", () => {
    // Both chats contain the letter 'a'; c1 (updatedAt 200) should come before c2.
    const hits = searchChats(chats, "a");
    const firstC2 = hits.findIndex((h) => h.chatId === "c2");
    const lastC1 = hits.map((h) => h.chatId).lastIndexOf("c1");
    expect(lastC1).toBeLessThan(firstC2);
  });

  it("respects the result limit", () => {
    expect(searchChats(chats, "a", 1)).toHaveLength(1);
  });
});
