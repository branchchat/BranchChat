// Pure tree-layout helper for the canvas.
//
// Kept as its own module (todo.md P1: "extract layout helpers ... into a
// dedicated testable module") so positions can be unit-tested without React
// Flow. Produces a tidy top-down layout: depth → y, siblings spread along x,
// parents centered over their children.

import type { ChatNode } from "@/types/chat";

export interface XYPosition {
  x: number;
  y: number;
}

// Approximate node footprint used for spacing. The real rendered height
// varies with content; Y_GAP must clear a fully-clamped node (header +
// 12rem content clamp + footer row) with breathing room below it.
export const NODE_WIDTH = 320;
export const X_GAP = 48;
export const Y_GAP = 380;

// Returns a position keyed by node id. Leaves are packed left-to-right; each
// internal node is centered over the span of its children.
export function computeTreeLayout(
  nodes: Record<string, ChatNode>,
  rootId: string,
): Record<string, XYPosition> {
  const positions: Record<string, XYPosition> = {};
  const visited = new Set<string>();
  let nextLeafX = 0;

  const walk = (id: string, depth: number): number => {
    const node = nodes[id];
    if (!node || visited.has(id)) return nextLeafX;
    visited.add(id);

    const children = node.childrenIds.filter((childId) => nodes[childId]);

    let centerX: number;
    if (children.length === 0) {
      centerX = nextLeafX;
      nextLeafX += NODE_WIDTH + X_GAP;
    } else {
      const childCenters = children.map((childId) => walk(childId, depth + 1));
      centerX = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    }

    positions[id] = { x: centerX, y: depth * Y_GAP };
    return centerX;
  };

  walk(rootId, 0);

  // Lay out any orphaned nodes (not reachable from root) so nothing vanishes.
  for (const id of Object.keys(nodes)) {
    if (!positions[id]) {
      positions[id] = { x: nextLeafX, y: 0 };
      nextLeafX += NODE_WIDTH + X_GAP;
    }
  }

  return positions;
}
