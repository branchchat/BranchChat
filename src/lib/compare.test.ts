import { describe, expect, it } from "vitest";

import {
  branchLabelFor,
  divergenceIndex,
  listLeaves,
  pathToLeaf,
} from "@/lib/compare";
import type { ChatNode } from "@/types/chat";

// A small tree: root → u1 → a1 forks into branch A (u2a→a2a) and B (u2b→a2b).
function tree(): Record<string, ChatNode> {
  const mk = (
    id: string,
    parentId: string | null,
    role: ChatNode["role"],
    content: string,
    childrenIds: string[],
    createdAt: number,
    branchLabel?: string,
  ): ChatNode => ({ id, parentId, role, content, childrenIds, createdAt, branchLabel });

  return {
    root: mk("root", null, "system", "root", ["u1"], 1),
    u1: mk("u1", "root", "user", "question", ["a1"], 2),
    a1: mk("a1", "u1", "assistant", "answer", ["u2a", "u2b"], 3),
    u2a: mk("u2a", "a1", "user", "temples", ["a2a"], 4, "Temples"),
    a2a: mk("a2a", "u2a", "assistant", "temple plan", [], 5),
    u2b: mk("u2b", "a1", "user", "food", ["a2b"], 6, "Food"),
    a2b: mk("a2b", "u2b", "assistant", "food plan", [], 7),
  };
}

describe("compare helpers", () => {
  it("listLeaves returns leaf endpoints, oldest-first, with branch labels", () => {
    const leaves = listLeaves(tree());
    expect(leaves.map((l) => l.id)).toEqual(["a2a", "a2b"]);
    expect(leaves.map((l) => l.label)).toEqual(["Temples", "Food"]);
  });

  it("branchLabelFor finds the nearest ancestor label, else 'Main line'", () => {
    const t = tree();
    expect(branchLabelFor(t, "a2a")).toBe("Temples");
    expect(branchLabelFor(t, "a1")).toBe("Main line");
  });

  it("pathToLeaf returns the root→leaf path inclusive, oldest-first", () => {
    expect(pathToLeaf(tree(), "a2a").map((n) => n.id)).toEqual([
      "root",
      "u1",
      "a1",
      "u2a",
      "a2a",
    ]);
  });

  it("divergenceIndex is the length of the shared root prefix", () => {
    const t = tree();
    const left = pathToLeaf(t, "a2a");
    const right = pathToLeaf(t, "a2b");
    // Shared: root, u1, a1 (indexes 0..2); they diverge at index 3 (u2a vs u2b).
    expect(divergenceIndex(left, right)).toBe(3);
    // A path compared with itself never diverges.
    expect(divergenceIndex(left, left)).toBe(left.length);
  });
});
