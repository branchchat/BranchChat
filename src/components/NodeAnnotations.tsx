// Tags + comments footer for a canvas node.
//
// Lets a user organize an exploration without spending quota (the product's
// "tag/comment nodes" capability). Existing annotations always render; the
// add-affordances reveal on node hover so idle nodes stay clean. Everything is
// `nodrag` + stops propagation so typing/clicking doesn't pan the canvas or
// re-trigger node selection. Rendered inline (no popover) to avoid portal/
// z-index issues inside a React Flow node.

import { useState, type KeyboardEvent } from "react";
import { MessageSquarePlus, Tag, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chatStore";
import type { ChatNode } from "@/types/chat";

export function NodeAnnotations({ node }: { node: ChatNode }) {
  const addTag = useChatStore((s) => s.addTag);
  const removeTag = useChatStore((s) => s.removeTag);
  const addComment = useChatStore((s) => s.addComment);
  const removeComment = useChatStore((s) => s.removeComment);

  const tags = node.tags ?? [];
  const comments = node.comments ?? [];
  const hasContent = tags.length > 0 || comments.length > 0;

  const [tagDraft, setTagDraft] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [addingComment, setAddingComment] = useState(false);

  const commitTag = () => {
    addTag(node.id, tagDraft);
    setTagDraft("");
    setAddingTag(false);
  };
  const commitComment = () => {
    if (!commentDraft.trim()) return;
    addComment(node.id, commentDraft);
    setCommentDraft("");
    setAddingComment(false);
  };

  const onTagKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") commitTag();
    else if (e.key === "Escape") {
      setTagDraft("");
      setAddingTag(false);
    }
  };
  const onCommentKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitComment();
    } else if (e.key === "Escape") {
      setCommentDraft("");
      setAddingComment(false);
    }
  };

  return (
    <div
      className={cn(
        "nodrag mt-2 flex flex-col gap-1.5 border-t pt-2",
        // Idle, empty nodes stay clean — the footer appears on node hover.
        !hasContent &&
          !addingTag &&
          !addingComment &&
          "opacity-0 transition-opacity group-hover/node:opacity-100 focus-within:opacity-100",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="group/tag gap-1 py-0 pr-1 pl-1.5 text-[10px] font-normal"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              className="rounded-sm opacity-50 transition-opacity hover:opacity-100"
              onClick={() => removeTag(node.id, tag)}
            >
              <X className="size-2.5" />
            </button>
          </Badge>
        ))}

        {addingTag ? (
          <input
            autoFocus
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onTagKey}
            onBlur={commitTag}
            placeholder="tag…"
            aria-label="New tag"
            className="h-5 w-20 rounded border bg-background px-1.5 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingTag(true)}
            className="flex items-center gap-0.5 rounded px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Tag className="size-2.5" />
            tag
          </button>
        )}
      </div>

      {/* Comments */}
      {comments.length > 0 && (
        <ul className="flex flex-col gap-1">
          {comments.map((c) => (
            <li
              key={c.id}
              className="group/c flex items-start gap-1 rounded bg-muted/60 px-1.5 py-1 text-[11px] leading-snug text-muted-foreground"
            >
              <MessageSquarePlus className="mt-px size-3 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1 whitespace-pre-wrap">
                {c.content}
              </span>
              <button
                type="button"
                aria-label="Delete comment"
                className="shrink-0 rounded-sm opacity-0 transition-opacity group-hover/c:opacity-60 hover:!opacity-100"
                onClick={() => removeComment(node.id, c.id)}
              >
                <X className="size-2.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {addingComment ? (
        <textarea
          autoFocus
          rows={2}
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          onKeyDown={onCommentKey}
          onBlur={commitComment}
          placeholder="Add a comment… (Enter to save)"
          aria-label="New comment"
          className="resize-none rounded border bg-background px-1.5 py-1 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAddingComment(true)}
          className="flex w-fit items-center gap-0.5 rounded px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <MessageSquarePlus className="size-2.5" />
          comment
        </button>
      )}
    </div>
  );
}
