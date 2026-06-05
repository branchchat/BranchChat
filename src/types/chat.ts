// Core conversation types for BranchChat.
//
// The browser is the source of truth for the conversation tree (see
// architecture.md "Frontend Source Of Truth"). These shapes mirror the
// `ChatNode` / `ChatSessionState` described in the docs and are the contract
// the store, canvas, and node UI build on.

export type ChatRole = "system" | "user" | "assistant";

// Workspaces the docs reference; kept open-ended for forward compat.
export type Workspace =
  | "personal"
  | "research"
  | "coding-interview-prep"
  | (string & {});

export interface NodeComment {
  id: string;
  content: string;
  createdAt: number;
  author?: string;
}

// One research-journal audit entry (branch / tag / compare / note events).
export interface JournalEntry {
  id: string;
  type: "branch" | "tag" | "compare" | "note" | "context-link";
  message: string;
  nodeId?: string;
  createdAt: number;
}

// One message node in the conversation tree.
//
// Invariants (see architecture.md "Tree invariants"):
// - `parentId` + `childrenIds` define the real tree (null parent = root).
// - `contextNodeIds` are orthogonal cross-branch links, NOT tree edges.
export interface ChatNode {
  id: string;
  parentId: string | null;
  role: ChatRole;
  content: string;
  childrenIds: string[];

  // Cross-branch supplemental context links (not parent/child edges).
  contextNodeIds?: string[];

  // Branch metadata.
  branchLabel?: string;
  branchColor?: string;
  branchSummary?: string;
  focusText?: string;

  // Local organization metadata.
  tags?: string[];
  comments?: NodeComment[];

  // Per-node mode + transient flags.
  codingMode?: boolean;
  isLoading?: boolean;

  // Canvas layout (assigned by the layout pass / React Flow).
  position?: { x: number; y: number };
  width?: number;
  height?: number;

  createdAt: number;
}

// One chat tab/workspace. A user may have several of these at once.
export interface ChatSessionState {
  id: string;
  title: string;
  workspace: Workspace;

  // Node records keyed by id, plus the tree entry point.
  nodes: Record<string, ChatNode>;
  rootId: string;

  // Selection + the path from root to the selected node (inclusive).
  selectedNodeId: string;
  activePath: string[];

  collapsedNodeIds: string[];
  journalEntries: JournalEntry[];

  createdAt: number;
  updatedAt: number;
}
