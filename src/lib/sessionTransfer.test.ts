import { describe, expect, it } from "vitest";

import {
  EXPORT_VERSION,
  parseSession,
  serializeChat,
} from "@/lib/sessionTransfer";
import type { ChatSessionState } from "@/types/chat";

function sampleChat(): ChatSessionState {
  return {
    id: "chat_1",
    title: "Kyoto trip",
    workspace: "research",
    rootId: "root",
    selectedNodeId: "a1",
    activePath: ["root", "u1", "a1"],
    collapsedNodeIds: [],
    journalEntries: [],
    createdAt: 100,
    updatedAt: 200,
    nodes: {
      root: {
        id: "root",
        parentId: null,
        role: "system",
        content: "root",
        childrenIds: ["u1"],
        createdAt: 100,
      },
      u1: {
        id: "u1",
        parentId: "root",
        role: "user",
        content: "hi",
        childrenIds: ["a1"],
        createdAt: 110,
        tags: ["itinerary"],
      },
      a1: {
        id: "a1",
        parentId: "u1",
        role: "assistant",
        content: "hello",
        childrenIds: ["ghost"], // dangling reference — should be pruned
        createdAt: 120,
        // transient/layout fields that import must drop:
        isLoading: true,
        isError: true,
        position: { x: 5, y: 9 },
        width: 280,
        height: 120,
      },
    },
  };
}

describe("sessionTransfer", () => {
  it("serializes into a versioned envelope", () => {
    const env = JSON.parse(serializeChat(sampleChat()));
    expect(env.type).toBe("branchchat-session");
    expect(env.version).toBe(EXPORT_VERSION);
    expect(env.chat.title).toBe("Kyoto trip");
  });

  it("round-trips, keeping metadata but dropping transient/layout fields", () => {
    const parsed = parseSession(serializeChat(sampleChat()));
    expect(parsed.title).toBe("Kyoto trip");
    expect(parsed.workspace).toBe("research");
    // Organizational metadata survives.
    expect(parsed.nodes.u1.tags).toEqual(["itinerary"]);
    // Transient + layout fields are stripped so the canvas re-lays-out cleanly.
    const a1 = parsed.nodes.a1;
    expect(a1.isLoading).toBeUndefined();
    expect(a1.isError).toBeUndefined();
    expect(a1.position).toBeUndefined();
    expect(a1.width).toBeUndefined();
    // Dangling child reference is pruned.
    expect(a1.childrenIds).toEqual([]);
  });

  it("rejects non-JSON, wrong type, and newer versions", () => {
    expect(() => parseSession("not json")).toThrow(/valid JSON/);
    expect(() => parseSession(JSON.stringify({ type: "nope" }))).toThrow(
      /BranchChat session/,
    );
    expect(() =>
      parseSession(
        JSON.stringify({
          type: "branchchat-session",
          version: EXPORT_VERSION + 1,
          chat: sampleChat(),
        }),
      ),
    ).toThrow(/newer version/);
  });

  it("rejects an export missing its conversation tree", () => {
    expect(() =>
      parseSession(
        JSON.stringify({ type: "branchchat-session", version: 1, chat: {} }),
      ),
    ).toThrow(/missing its conversation tree/);
  });
});
