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

// Display metadata for a file sent with a message (never the bytes).
export interface NodeAttachment {
  name: string;
  mediaType: string;
}

// One research-journal audit entry (branch / tag / compare / note events).
export interface JournalEntry {
  id: string;
  type: "branch" | "tag" | "compare" | "note" | "context-link";
  message: string;
  nodeId?: string;
  createdAt: number;
}

// A branch's AI model selection. Lives on the node that STARTS the branch
// (its first user node) and applies to every descendant until a deeper
// override appears — resolution is "nearest ancestor override wins" (see
// resolveModelForNode in chatStore), so nested branches can each pick their
// own model while siblings stay unaffected.
export interface ModelChoice {
  provider: string;
  model: string;
  // Display label captured at selection time (from the backend catalog), so
  // chips/journal copy render without an extra lookup.
  label?: string;
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

  // Model-specific branches: the override this node introduces (if any)…
  modelOverride?: ModelChoice;
  // …and, on assistant nodes, what actually generated this reply (reported
  // by the backend — can differ from the request when a provider falls back).
  provider?: string;
  model?: string;

  // Local organization metadata.
  tags?: string[];
  comments?: NodeComment[];

  // Files that were sent WITH this user message. Metadata only — the bytes
  // go to the provider once and are never persisted (localStorage and the
  // sync payload would blow up otherwise).
  attachments?: NodeAttachment[];

  // Per-node mode + transient flags.
  codingMode?: boolean;
  isLoading?: boolean;
  isError?: boolean; // assistant reply failed (e.g. backend unreachable / 429)

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
