// Branch-compare overlay: two conversation endpoints side by side.
//
// The product's "compare paths" capability. Pick an endpoint per column; the
// shared root context is dimmed and each path's own messages (after the fork)
// are highlighted, with a "Paths diverge here" marker at the split — so it's
// obvious what the two branches share and where they parted. Driven by the
// store's transient `compareOpen` flag; rendered full-screen by AppChat.

import { useEffect, useMemo, useState } from "react";
import { GitCompare, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  divergenceIndex,
  listLeaves,
  pathToLeaf,
  type CompareLeaf,
} from "@/lib/compare";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chatStore";
import type { ChatNode, ChatRole } from "@/types/chat";

const ROLE_LABEL: Record<ChatRole, string> = {
  system: "System",
  user: "You",
  assistant: "Assistant",
};

function Bubble({ node, shared }: { node: ChatNode; shared: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm transition-colors",
        shared
          ? "border-dashed bg-muted/30 text-muted-foreground"
          : node.role === "user"
            ? "border-primary/25 bg-primary/5"
            : "bg-card shadow-sm",
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <Badge
          variant={node.role === "user" ? "default" : "outline"}
          className="text-[10px]"
        >
          {ROLE_LABEL[node.role]}
        </Badge>
        {node.branchLabel && (
          <span className="text-[10px] text-muted-foreground">
            {node.branchLabel}
          </span>
        )}
        {shared && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            shared
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap">
        {node.content || <span className="italic">Empty</span>}
      </p>
    </div>
  );
}

function Column({
  leaves,
  selectedId,
  onSelect,
  path,
  divergeAt,
  side,
}: {
  leaves: CompareLeaf[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  path: ChatNode[];
  divergeAt: number;
  side: "left" | "right";
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="shrink-0 border-b p-3">
        <label className="sr-only" htmlFor={`compare-${side}`}>
          {side === "left" ? "Left" : "Right"} branch endpoint
        </label>
        <select
          id={`compare-${side}`}
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {leaves.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label} — {l.snippet}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {path.map((node, i) => (
          <div key={node.id} className="space-y-2">
            {i === divergeAt && i > 0 && (
              <div className="flex items-center gap-2 py-1 text-[10px] font-medium tracking-wide text-primary/70 uppercase">
                <span className="h-px flex-1 bg-primary/20" />
                Paths diverge here
                <span className="h-px flex-1 bg-primary/20" />
              </div>
            )}
            <Bubble node={node} shared={i < divergeAt} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompareView() {
  const open = useChatStore((s) => s.compareOpen);
  const close = useChatStore((s) => s.closeCompare);
  const chat = useChatStore((s) => s.chats[s.activeChatId]);

  const leaves = useMemo(() => (chat ? listLeaves(chat.nodes) : []), [chat]);
  // Only the user's explicit picks are stored; the effective selection is
  // derived below with sensible defaults (first two endpoints), so there's no
  // setState-in-effect and a stale pick (e.g. after switching chats) falls
  // back gracefully instead of pointing at a node that no longer exists.
  const [leftPick, setLeftPick] = useState<string | null>(null);
  const [rightPick, setRightPick] = useState<string | null>(null);

  const validPick = (id: string | null) =>
    id && leaves.some((l) => l.id === id) ? id : null;
  const leftId = validPick(leftPick) ?? leaves[0]?.id ?? null;
  const rightId =
    validPick(rightPick) ?? leaves[1]?.id ?? leaves[0]?.id ?? null;

  // Escape closes the overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open || !chat) return null;

  const leftPath = leftId ? pathToLeaf(chat.nodes, leftId) : [];
  const rightPath = rightId ? pathToLeaf(chat.nodes, rightId) : [];
  const divergeAt = divergenceIndex(leftPath, rightPath);
  const enough = leaves.length >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Compare branches"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <GitCompare className="size-4 shrink-0" />
          <h2 className="text-sm font-semibold">Compare branches</h2>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            Shared context is dimmed; each path's own messages are highlighted.
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close compare"
          onClick={close}
        >
          <X className="size-4" />
        </Button>
      </header>

      {enough ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x">
          <Column
            leaves={leaves}
            selectedId={leftId}
            onSelect={setLeftPick}
            path={leftPath}
            divergeAt={divergeAt}
            side="left"
          />
          <Column
            leaves={leaves}
            selectedId={rightId}
            onSelect={setRightPick}
            path={rightPath}
            divergeAt={divergeAt}
            side="right"
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          Branch your conversation into at least two paths to compare them side
          by side.
        </div>
      )}
    </div>
  );
}
