// Toolbar — left sidebar workspace/chat browser and chat management.
//
// Lists every chat grouped by workspace (most-recently-updated first within a
// group), switches the active chat on click, and supports new / rename /
// delete. Search lands in a follow-up. Toggled from the header (see App.tsx);
// when hidden it renders nothing so the canvas gets the full width.

import { useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn, formatRelativeTime } from "@/lib/utils";
import { searchChats, type SearchResult } from "@/lib/search";
import { useChatStore } from "@/store/chatStore";
import type { ChatSessionState, Workspace } from "@/types/chat";

const ROLE_LABEL = { system: "System", user: "You", assistant: "Assistant" };

// Render a snippet with the matched span highlighted (matchStart < 0 = the hit
// was a branch label / tag, so show the snippet plain).
function HighlightedSnippet({ result }: { result: SearchResult }) {
  const { snippet, matchStart, matchLength } = result;
  if (matchStart < 0) return <>{snippet}</>;
  return (
    <>
      {snippet.slice(0, matchStart)}
      <mark className="rounded-sm bg-amber-200 text-foreground dark:bg-amber-400/30">
        {snippet.slice(matchStart, matchStart + matchLength)}
      </mark>
      {snippet.slice(matchStart + matchLength)}
    </>
  );
}

const WORKSPACE_LABELS: Record<string, string> = {
  personal: "Personal",
  research: "Research",
  "coding-interview-prep": "Coding Interview Prep",
};

function workspaceLabel(ws: Workspace): string {
  return (
    WORKSPACE_LABELS[ws] ??
    ws.charAt(0).toUpperCase() + ws.slice(1).replace(/-/g, " ")
  );
}

// Group chats by workspace, each group sorted by updatedAt desc, groups
// ordered by their most-recent chat.
function groupByWorkspace(
  chats: ChatSessionState[],
): [Workspace, ChatSessionState[]][] {
  const groups = new Map<Workspace, ChatSessionState[]>();
  for (const chat of chats) {
    const list = groups.get(chat.workspace) ?? [];
    list.push(chat);
    groups.set(chat.workspace, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return [...groups.entries()].sort(
    (a, b) => b[1][0].updatedAt - a[1][0].updatedAt,
  );
}

export function Toolbar() {
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const createChat = useChatStore((s) => s.createChat);
  const switchChat = useChatStore((s) => s.switchChat);
  const renameChat = useChatStore((s) => s.renameChat);
  const deleteChat = useChatStore((s) => s.deleteChat);
  const openNode = useChatStore((s) => s.openNode);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ChatSessionState | null>(
    null,
  );
  const [query, setQuery] = useState("");

  const grouped = groupByWorkspace(Object.values(chats));
  const searching = query.trim().length > 0;
  const results = searching ? searchChats(chats, query) : [];

  const startRename = (chat: ChatSessionState) => {
    setEditingId(chat.id);
    setDraftTitle(chat.title);
  };
  const commitRename = () => {
    if (editingId) renameChat(editingId, draftTitle);
    setEditingId(null);
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-card/40">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Chats
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => createChat()}
        >
          <Plus className="size-3.5" />
          New
        </Button>
      </div>

      <div className="relative px-2 pb-2">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all chats…"
          className="h-8 pr-7 pl-7 text-sm"
        />
        {searching && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute top-1/2 right-4 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => setQuery("")}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {searching ? (
          results.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No matches for “{query.trim()}”.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {results.map((r) => (
                <li key={`${r.chatId}:${r.nodeId}`}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
                    onClick={() => openNode(r.chatId, r.nodeId)}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="truncate">{r.chatTitle}</span>
                      <span aria-hidden>·</span>
                      <span className="shrink-0">
                        {r.branchLabel ?? ROLE_LABEL[r.role]}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-xs text-foreground">
                      <HighlightedSnippet result={r} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          grouped.map(([workspace, list]) => (
          <div key={workspace} className="mb-3">
            <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {workspaceLabel(workspace)}
            </p>
            <ul className="flex flex-col gap-0.5">
              {list.map((chat) => {
                const isActive = chat.id === activeChatId;
                const isEditing = chat.id === editingId;
                return (
                  <li key={chat.id}>
                    {isEditing ? (
                      <Input
                        autoFocus
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-8 text-sm"
                      />
                    ) : (
                      <div
                        className={cn(
                          "group/row flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                          isActive
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left"
                          onClick={() => switchChat(chat.id)}
                          title={chat.title}
                        >
                          {chat.title}
                        </button>
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums group-hover/row:hidden">
                          {formatRelativeTime(chat.updatedAt)}
                        </span>
                        <span className="hidden shrink-0 items-center group-hover/row:flex">
                          <button
                            type="button"
                            aria-label="Rename chat"
                            className="rounded p-1 hover:bg-background"
                            onClick={() => startRename(chat)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete chat"
                            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                            onClick={() => setPendingDelete(chat)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          ))
        )}
      </nav>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.title}” and its whole node tree will be removed
              from this browser. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) deleteChat(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
