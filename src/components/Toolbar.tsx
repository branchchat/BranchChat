// Toolbar — left sidebar workspace/chat browser and chat management.
//
// Lists every chat grouped by workspace (most-recently-updated first within a
// group), switches the active chat on click, and supports new / rename /
// delete. Search lands in a follow-up. Toggled from the header (see App.tsx);
// when hidden it renders nothing so the canvas gets the full width.

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

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
import { useChatStore } from "@/store/chatStore";
import type { ChatSessionState, Workspace } from "@/types/chat";

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ChatSessionState | null>(
    null,
  );

  const grouped = groupByWorkspace(Object.values(chats));

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

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {grouped.map(([workspace, list]) => (
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
        ))}
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
