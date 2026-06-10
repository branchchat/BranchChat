// Export / import a single conversation as a portable JSON file.
//
// The app is local-first (the tree lives in localStorage), so this is how a
// user backs up, moves, or shares a conversation between browsers. Export wraps
// the chat in a versioned envelope; import validates + normalizes it (the store
// then assigns a fresh chat id and recomputes the active path).
//
// Normalization deliberately DROPS transient/layout fields (isLoading, isError,
// position/width/height) so an imported session never arrives mid-stream or
// with stale coordinates — the canvas re-runs layout from scratch. This is also
// what keeps imported node size/position consistent regardless of the source.

import type { ChatNode, ChatRole, ChatSessionState } from "@/types/chat";

export const EXPORT_VERSION = 1;

const VALID_ROLES = new Set<ChatRole>(["system", "user", "assistant"]);

export interface SessionExport {
  type: "branchchat-session";
  version: number;
  exportedAt: number;
  chat: ChatSessionState;
}

// Serialize the active chat into a pretty-printed, versioned envelope.
export function serializeChat(chat: ChatSessionState): string {
  const envelope: SessionExport = {
    type: "branchchat-session",
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    chat,
  };
  return JSON.stringify(envelope, null, 2);
}

// Parse + validate a session export. Throws Error with a user-facing message on
// anything malformed; returns a sanitized chat (with a placeholder id/empty
// activePath the store fills in). Keeps organizational metadata (tags,
// comments, branch labels, model overrides), drops transient/layout fields.
export function parseSession(text: string): ChatSessionState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  const env = data as Partial<SessionExport> | null;
  if (!env || typeof env !== "object" || env.type !== "branchchat-session") {
    throw new Error("This doesn't look like a BranchChat session export.");
  }
  if (typeof env.version === "number" && env.version > EXPORT_VERSION) {
    throw new Error(
      "This session was exported by a newer version of BranchChat. Update and try again.",
    );
  }
  return sanitizeChat(env.chat);
}

function sanitizeChat(raw: unknown): ChatSessionState {
  const c = raw as Partial<ChatSessionState> | null;
  if (
    !c ||
    typeof c !== "object" ||
    !c.nodes ||
    typeof c.rootId !== "string" ||
    !(c.rootId in c.nodes)
  ) {
    throw new Error("This session is missing its conversation tree.");
  }

  const rootId = c.rootId;
  const clean: Record<string, ChatNode> = {};
  for (const [id, value] of Object.entries(c.nodes)) {
    const n = value as ChatNode;
    if (!n || typeof n !== "object" || n.id !== id || !VALID_ROLES.has(n.role)) {
      continue; // skip malformed entries rather than failing the whole import
    }
    clean[id] = {
      id,
      parentId: typeof n.parentId === "string" ? n.parentId : null,
      role: n.role,
      content: typeof n.content === "string" ? n.content : "",
      childrenIds: Array.isArray(n.childrenIds)
        ? n.childrenIds.filter((x): x is string => typeof x === "string")
        : [],
      branchLabel: n.branchLabel,
      branchColor: n.branchColor,
      branchSummary: n.branchSummary,
      focusText: n.focusText,
      modelOverride: n.modelOverride,
      provider: n.provider,
      model: n.model,
      tags: Array.isArray(n.tags) ? n.tags : undefined,
      comments: Array.isArray(n.comments) ? n.comments : undefined,
      contextNodeIds: Array.isArray(n.contextNodeIds)
        ? n.contextNodeIds
        : undefined,
      codingMode: n.codingMode,
      createdAt: typeof n.createdAt === "number" ? n.createdAt : Date.now(),
      // Intentionally dropped: isLoading, isError, position, width, height.
    };
  }

  // Prune dangling references so the tree is internally consistent.
  for (const n of Object.values(clean)) {
    n.childrenIds = n.childrenIds.filter((cid) => cid in clean);
    if (n.id === rootId) n.parentId = null;
    else if (!n.parentId || !(n.parentId in clean)) n.parentId = null;
  }

  const selectedNodeId =
    typeof c.selectedNodeId === "string" && c.selectedNodeId in clean
      ? c.selectedNodeId
      : rootId;

  return {
    id: rootId, // placeholder; the store assigns a fresh chat id on import
    title:
      typeof c.title === "string" && c.title.trim() ? c.title : "Imported chat",
    workspace: typeof c.workspace === "string" ? c.workspace : "personal",
    nodes: clean,
    rootId,
    selectedNodeId,
    activePath: [], // the store recomputes this from selectedNodeId
    collapsedNodeIds: [],
    journalEntries: Array.isArray(c.journalEntries) ? c.journalEntries : [],
    createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
}

// --- large-session safeguard -------------------------------------------------

export const STORAGE_KEY = "branchchat-storage";
// localStorage caps near ~5 MB; nudge the user to export/back up past ~3.5 MB
// of stored JSON (chars ≈ bytes for mostly-ASCII chat text).
export const STORAGE_WARN_CHARS = 3_500_000;

// Approximate size of the persisted store, in characters. 0 when unavailable.
export function storageUsageChars(): number {
  try {
    return (localStorage.getItem(STORAGE_KEY) ?? "").length;
  } catch {
    return 0;
  }
}
