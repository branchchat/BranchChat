// Focused reading view: the selected path (root→selected node) as a clean,
// single-column transcript.
//
// On a tall tree, full-canvas zoom makes the text of a long conversation hard
// to read. This overlay drops the graph and renders just the active path —
// comfortable measure, generous line-height — so you can read one branch
// end to end. Driven by the store's transient `focusViewOpen` flag; rendered
// full-screen by AppChat.

import { useEffect } from "react";
import { BookOpen, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/Markdown";
import { useChatStore } from "@/store/chatStore";
import type { ChatRole } from "@/types/chat";

const ROLE_LABEL: Record<ChatRole, string> = {
  system: "System",
  user: "You",
  assistant: "Assistant",
};

export function FocusView() {
  const open = useChatStore((s) => s.focusViewOpen);
  const close = useChatStore((s) => s.closeFocusView);
  const chat = useChatStore((s) => s.chats[s.activeChatId]);

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

  // The selected path, root→selected. activePath is store-maintained; fall back
  // to filtering against the node map in case an id is stale.
  const path = chat.activePath
    .map((id) => chat.nodes[id])
    .filter((n): n is NonNullable<typeof n> => Boolean(n));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Focused reading view"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen className="size-4 shrink-0" />
          <h2 className="truncate text-sm font-semibold">{chat.title}</h2>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            · reading this path
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close reading view"
          onClick={close}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-5 py-8">
          {path.map((node) => (
            <article key={node.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    node.role === "user"
                      ? "default"
                      : node.role === "assistant"
                        ? "outline"
                        : "secondary"
                  }
                  className="text-[10px]"
                >
                  {ROLE_LABEL[node.role]}
                </Badge>
                {node.branchLabel && (
                  <span className="text-xs text-muted-foreground">
                    {node.branchLabel}
                  </span>
                )}
                {node.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] text-muted-foreground"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              {node.role === "assistant" && node.content ? (
                <Markdown className="text-[15px] [&]:text-[15px]">
                  {node.content}
                </Markdown>
              ) : (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {node.content || (
                    <span className="text-muted-foreground italic">Empty</span>
                  )}
                </p>
              )}
              {node.comments?.map((c) => (
                <p
                  key={c.id}
                  className="border-l-2 border-muted pl-3 text-sm text-muted-foreground"
                >
                  {c.content}
                </p>
              ))}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
