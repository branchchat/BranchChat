import { describe, expect, it } from "vitest";

import { computeTreeLayout, NODE_WIDTH, X_GAP, Y_GAP } from "@/lib/treeLayout";
import type { ChatNode } from "@/types/chat";

const X_STRIDE = NODE_WIDTH + X_GAP; // horizontal distance between adjacent leaves

// Minimal node factory: only the fields the layout reads.
function node(id: string, parentId: string | null, childrenIds: string[] = []): ChatNode {
  return { id, parentId, role: "user", content: "", childrenIds, createdAt: 0 };
}

function toMap(nodes: ChatNode[]): Record<string, ChatNode> {
  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}

describe("computeTreeLayout", () => {
  it("places a lone root at the origin", () => {
    const pos = computeTreeLayout(toMap([node("root", null)]), "root");
    expect(pos.root).toEqual({ x: 0, y: 0 });
  });

  it("stacks a linear chain straight down, one Y_GAP per depth", () => {
    const nodes = toMap([
      node("root", null, ["a"]),
      node("a", "root", ["b"]),
      node("b", "a"),
    ]);
    const pos = computeTreeLayout(nodes, "root");
    // Single-child parents sit directly above the child → all share x = 0.
    expect(pos.root).toEqual({ x: 0, y: 0 });
    expect(pos.a).toEqual({ x: 0, y: Y_GAP });
    expect(pos.b).toEqual({ x: 0, y: 2 * Y_GAP });
  });

  it("spreads siblings and centers the parent over them", () => {
    const nodes = toMap([
      node("root", null, ["a", "b"]),
      node("a", "root"),
      node("b", "root"),
    ]);
    const pos = computeTreeLayout(nodes, "root");
    expect(pos.a).toEqual({ x: 0, y: Y_GAP });
    expect(pos.b).toEqual({ x: X_STRIDE, y: Y_GAP });
    // Parent centered between the two leaves.
    expect(pos.root).toEqual({ x: X_STRIDE / 2, y: 0 });
  });

  it("packs leaves left-to-right across separate subtrees", () => {
    const nodes = toMap([
      node("root", null, ["l", "r"]),
      node("l", "root", ["l1", "l2"]),
      node("l1", "l"),
      node("l2", "l"),
      node("r", "root"),
    ]);
    const pos = computeTreeLayout(nodes, "root");
    // Three leaves overall: l1, l2, then r — each a stride apart.
    expect(pos.l1.x).toBe(0);
    expect(pos.l2.x).toBe(X_STRIDE);
    expect(pos.r.x).toBe(2 * X_STRIDE);
    // Depth-2 leaves are deeper than the depth-1 'r'.
    expect(pos.l1.y).toBe(2 * Y_GAP);
    expect(pos.r.y).toBe(Y_GAP);
  });

  it("still positions orphan nodes unreachable from the root", () => {
    const nodes = toMap([node("root", null), node("orphan", "missing-parent")]);
    const pos = computeTreeLayout(nodes, "root");
    expect(pos.root).toBeDefined();
    expect(pos.orphan).toBeDefined();
  });

  it("does not loop on a parent/child cycle", () => {
    // a → b → a (malformed); the visited-guard must terminate.
    const nodes = toMap([
      node("root", null, ["a"]),
      node("a", "root", ["b"]),
      node("b", "a", ["a"]),
    ]);
    const pos = computeTreeLayout(nodes, "root");
    expect(Object.keys(pos)).toEqual(
      expect.arrayContaining(["root", "a", "b"]),
    );
  });
});
