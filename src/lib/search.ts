// Pure cross-chat search over the local conversation trees.
//
// Kept framework-free (no React/store imports beyond types) so it's unit
// testable. Matches node content, branch labels, and tags case-insensitively
// across every chat, and returns a content snippet windowed around the hit so
// the Toolbar can show context and highlight the term.

import type { ChatRole, ChatSessionState } from "@/types/chat";

export interface SearchResult {
  chatId: string;
  chatTitle: string;
  nodeId: string;
  role: ChatRole;
  // Content excerpt around the match (or the content head when the match was a
  // label/tag), for display + highlighting.
  snippet: string;
  // Index of the match within `snippet` (-1 when the hit was a label/tag, not
  // body text), so the caller can highlight it.
  matchStart: number;
  matchLength: number;
  branchLabel?: string;
}

const SNIPPET_RADIUS = 48;
const DEFAULT_LIMIT = 50;

// Build a snippet centered on `matchIndex` within `content`, with ellipses when
// the content is clipped. Returns the snippet and the match's offset inside it.
function makeSnippet(
  content: string,
  matchIndex: number,
  matchLength: number,
): { snippet: string; matchStart: number } {
  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(content.length, matchIndex + matchLength + SNIPPET_RADIUS);
  let snippet = content.slice(start, end);
  let matchStart = matchIndex - start;
  if (start > 0) {
    snippet = "…" + snippet;
    matchStart += 1;
  }
  if (end < content.length) snippet = snippet + "…";
  return { snippet, matchStart };
}

// Search all chats for `query`. Chats are scanned most-recently-updated first;
// within a chat, nodes in record order. Empty/whitespace query → no results.
export function searchChats(
  chats: Record<string, ChatSessionState>,
  query: string,
  limit = DEFAULT_LIMIT,
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];
  const orderedChats = Object.values(chats).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  for (const chat of orderedChats) {
    for (const node of Object.values(chat.nodes)) {
      if (results.length >= limit) return results;

      const content = node.content ?? "";
      const contentIdx = content.toLowerCase().indexOf(q);

      let matched = contentIdx !== -1;
      let snippet = "";
      let matchStart = -1;

      if (matched) {
        const s = makeSnippet(content, contentIdx, q.length);
        snippet = s.snippet;
        matchStart = s.matchStart;
      } else {
        // Fall back to branch-label / tag matches; show the content head.
        const label = node.branchLabel?.toLowerCase() ?? "";
        const tagHit = (node.tags ?? []).some((t) =>
          t.toLowerCase().includes(q),
        );
        if (label.includes(q) || tagHit) {
          matched = true;
          snippet =
            content.length > SNIPPET_RADIUS * 2
              ? content.slice(0, SNIPPET_RADIUS * 2) + "…"
              : content;
        }
      }

      if (!matched) continue;

      results.push({
        chatId: chat.id,
        chatTitle: chat.title,
        nodeId: node.id,
        role: node.role,
        snippet,
        matchStart,
        matchLength: q.length,
        branchLabel: node.branchLabel,
      });
    }
  }

  return results;
}
