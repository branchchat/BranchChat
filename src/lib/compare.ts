// Pure helpers for the branch-compare view (compare two conversation
// endpoints side by side). Kept out of the component so the path/divergence
// logic is unit-testable without a DOM.

import type { ChatNode } from "@/types/chat";

export interface CompareLeaf {
  id: string;
  label: string; // nearest branch label on the path, or "Main line"
  snippet: string; // a short preview of the endpoint's content
}

// The nearest branch label at or above `nodeId` (what names this path),
// falling back to "Main line" for the unbranched trunk. Cycle-guarded.
export function branchLabelFor(
  nodes: Record<string, ChatNode>,
  nodeId: string,
): string {
  let current: string | null = nodeId;
  const seen = new Set<string>();
  while (current && nodes[current] && !seen.has(current)) {
    seen.add(current);
    const label = nodes[current].branchLabel;
    if (label) return label;
    current = nodes[current].parentId;
  }
  return "Main line";
}

// Endpoints worth comparing: leaf nodes (no children), excluding a lone root.
// Sorted oldest-first so column defaults are stable.
export function listLeaves(
  nodes: Record<string, ChatNode>,
): CompareLeaf[] {
  return Object.values(nodes)
    .filter((n) => n.childrenIds.length === 0 && n.parentId !== null)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((leaf) => ({
      id: leaf.id,
      label: branchLabelFor(nodes, leaf.id),
      snippet: leaf.content.slice(0, 60),
    }));
}

// Root→leaf path (inclusive), oldest first. Cycle-guarded.
export function pathToLeaf(
  nodes: Record<string, ChatNode>,
  leafId: string,
): ChatNode[] {
  const path: ChatNode[] = [];
  let current: string | null = leafId;
  const seen = new Set<string>();
  while (current && nodes[current] && !seen.has(current)) {
    seen.add(current);
    path.push(nodes[current]);
    current = nodes[current].parentId;
  }
  return path.reverse();
}

// Index where the two paths first differ — i.e. the length of their shared
// root prefix. Everything before this index is shared context; everything at
// or after it is unique to each path. Returns min length if one path is a
// prefix of the other.
export function divergenceIndex(left: ChatNode[], right: ChatNode[]): number {
  const max = Math.min(left.length, right.length);
  let i = 0;
  while (i < max && left[i].id === right[i].id) i += 1;
  return i;
}
