// Per-node UI on the canvas. A custom React Flow node that renders one
// ChatNode from the store as a shadcn Card with a role badge and its content.
//
// Renders + selection highlight, a retry action on errored assistant nodes,
// a model badge on AI replies (which model generated this response), and a
// hover "Branch with model" action that opens the ModelPicker for this node.

import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Bot, Maximize2, Paperclip, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/Markdown";
import { NodeAnnotations, NodeTags } from "@/components/NodeAnnotations";
import { modelLabel } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NODE_WIDTH } from "@/lib/treeLayout";
import { useChatStore } from "@/store/chatStore";
import type { ChatNode as ChatNodeType, ChatRole } from "@/types/chat";

// `flashKey` is the focus request's timestamp when this node was just opened
// via search; changing it remounts the pulse overlay so the animation replays.
export type ChatNodeData = { node: ChatNodeType; flashKey?: number };
export type ChatFlowNode = Node<ChatNodeData, "chat">;

const ROLE_LABEL: Record<ChatRole, string> = {
  system: "System",
  user: "You",
  assistant: "Assistant",
};

const ROLE_VARIANT: Record<
  ChatRole,
  "default" | "secondary" | "outline"
> = {
  system: "secondary",
  user: "default",
  assistant: "outline",
};

// The card itself, memoized on the node record. React Flow re-renders the
// custom node component on every drag frame (its position props change);
// without this inner memo that meant re-running the Markdown/KaTeX renderer
// per frame for the dragged node — visible as blinking/disappearing text.
const ChatNodeBody = memo(function ChatNodeBody({
  node,
  selected,
  flashKey,
}: {
  node: ChatNodeType;
  selected: boolean;
  flashKey?: number;
}) {
  const isRoot = node.parentId === null;
  const retryAssistant = useChatStore((s) => s.retryAssistant);
  const selectNode = useChatStore((s) => s.selectNode);
  const openModelPicker = useChatStore((s) => s.openModelPicker);

  // Long replies are clamped on the canvas (the layout's row height is
  // fixed, so a node can't grow in place without overlapping its children).
  // When the clamp actually cuts something off, offer "Show more", which
  // expands this message into a large popup — full text, scrollable.
  const contentRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const el = contentRef.current;
    setClamped(!!el && el.scrollHeight > el.clientHeight + 1);
  }, [node.content, node.isLoading]);

  // Which model generated this reply (assistant nodes, stamped from the
  // backend response). Label resolves via the cached catalog, raw id before
  // the catalog loads.
  const generatedBy =
    node.role === "assistant" && !node.isLoading
      ? modelLabel(node.provider, node.model)
      : null;

  // Sits in the footer row, same line as the tag/comment affordances.
  const showMore = clamped ? (
    <button
      type="button"
      className="nodrag inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        setExpanded(true);
      }}
    >
      <Maximize2 className="size-3" />
      Show more
    </button>
  ) : null;

  return (
    <div className="group/node relative" style={{ width: NODE_WIDTH }}>
      {/* Pulse overlay for a node just opened from search. Keyed by flashKey so
          re-opening replays the animation; pointer-events-none keeps it inert. */}
      {flashKey != null && (
        <span
          key={flashKey}
          aria-hidden
          className="animate-node-flash pointer-events-none absolute -inset-0.5 rounded-xl"
        />
      )}

      <Card
        className={cn(
          "w-full gap-2 py-3 text-left transition-shadow",
          node.isError && "border-destructive/50 bg-destructive/5",
          selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        )}
      >
        {/* Incoming edge from parent (root has no parent). Tree handles are
            display-only — connections happen via the side context ports. */}
        {!isRoot && (
          <Handle
            type="target"
            position={Position.Top}
            isConnectable={false}
            className="!bg-border"
          />
        )}

        {/* Context-link ports: drag from the RIGHT port of any node to the
            LEFT port of another to feed this exchange into that branch's
            prompts (dashed edge; click the edge to unlink). The root system
            node is UI copy, so it has no ports. */}
        {!isRoot && !node.isLoading && (
          <>
            <Handle
              id="ctx-in"
              type="target"
              position={Position.Left}
              className="!size-2.5 !border-2 !border-background !bg-muted-foreground/70 opacity-40 transition-opacity group-hover/node:opacity-100"
            >
              <span className="sr-only">Link context into this branch</span>
            </Handle>
            <Handle
              id="ctx-out"
              type="source"
              position={Position.Right}
              className="!size-2.5 !border-2 !border-background !bg-muted-foreground/70 opacity-40 transition-opacity group-hover/node:opacity-100"
            >
              <span className="sr-only">
                Drag to link this message into another branch
              </span>
            </Handle>
          </>
        )}

        <CardHeader className="px-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <Badge variant={ROLE_VARIANT[node.role]}>
              {ROLE_LABEL[node.role]}
            </Badge>
            {node.branchLabel && (
              <span className="text-muted-foreground">{node.branchLabel}</span>
            )}
            {/* Top-right cluster: tags live up here (same line as the role),
                keeping the footer row free for Show more + add-affordances. */}
            {(!!node.tags?.length || generatedBy) && (
              <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
                <NodeTags node={node} />
                {generatedBy && (
                  <Badge variant="outline" className="font-normal">
                    {generatedBy}
                  </Badge>
                )}
              </span>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-3">
          {node.isLoading ? (
            <p className="text-sm text-muted-foreground italic">Thinking…</p>
          ) : (
            <>
              {/* Markdown for assistant replies (the system prompt asks for
                  it); plain text for user/system — people expect their own
                  asterisks untouched. max-h clamp instead of line-clamp so
                  block elements (lists, code) clamp too; the ref measures
                  overflow either way. */}
              <div
                ref={contentRef}
                className="max-h-[7.5rem] overflow-hidden"
              >
                {node.role === "assistant" && !node.isError && node.content ? (
                  <Markdown>{node.content}</Markdown>
                ) : (
                  <p
                    className={cn(
                      "text-sm whitespace-pre-wrap text-foreground",
                      node.isError && "text-destructive",
                    )}
                  >
                    {node.content || (
                      <span className="text-muted-foreground italic">
                        Empty
                      </span>
                    )}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Files that rode with this message (metadata only — the bytes
              went to the provider once and aren't stored). */}
          {!!node.attachments?.length && (
            <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              {node.attachments.map((a, i) => (
                <span key={`${a.name}:${i}`} className="inline-flex items-center gap-1">
                  <Paperclip className="size-3" />
                  {a.name}
                </span>
              ))}
            </p>
          )}

          {/* Re-request the reply for a failed assistant node (store clears the
              error and flips it back to loading). `nodrag` keeps React Flow from
              treating the click as a canvas/node drag. */}
          {node.isError && !node.isLoading && (
            <Button
              variant="outline"
              size="sm"
              className="nodrag mt-2 h-7 gap-1.5 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                retryAssistant(node.id);
              }}
            >
              <RotateCcw className="size-3" />
              Retry
            </Button>
          )}

          {/* Footer row: Show more + tags + comment affordance share the same
              line at the bottom of the node. Hidden while a reply is streaming;
              the root node isn't annotatable, so it gets a plain footer with
              just Show more when clamped. */}
          {!node.isLoading &&
            (isRoot ? (
              showMore && (
                <div className="nodrag mt-2 border-t pt-2">{showMore}</div>
              )
            ) : (
              <NodeAnnotations node={node} action={showMore} />
            ))}
        </CardContent>

        {/* Outgoing edge to children (display-only, see above). */}
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={false}
          className="!bg-border"
        />
      </Card>

      {/* Hover action: branch from THIS node with a chosen model. Selects the
          node first so the composer targets it; the picker (rendered by
          InputBar) opens via the store. Hidden while the reply is loading;
          `nodrag` keeps React Flow from treating the click as a drag. */}
      {!node.isLoading && (
        <Button
          variant="outline"
          size="sm"
          className="nodrag absolute -top-2.5 -right-2.5 h-6 gap-1 px-1.5 text-[10px] opacity-0 shadow-sm transition-opacity group-hover/node:opacity-100 focus-visible:opacity-100"
          aria-label="Branch from this message with a model"
          onClick={(e) => {
            e.stopPropagation();
            selectNode(node.id);
            openModelPicker(node.id);
          }}
        >
          <Bot className="size-3" />
          Branch with model
        </Button>
      )}

      {/* "Show more": the message expanded into a big, scrollable popup. */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Badge variant={ROLE_VARIANT[node.role]}>
                {ROLE_LABEL[node.role]}
              </Badge>
              {generatedBy && (
                <span className="text-muted-foreground font-normal">
                  {generatedBy}
                </span>
              )}
              {node.branchLabel && (
                <span className="text-muted-foreground font-normal">
                  · {node.branchLabel}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pr-1">
            {node.role === "assistant" ? (
              <Markdown>{node.content}</Markdown>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {node.content}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

// React Flow entry point: forwards only the stable bits to the memoized body,
// so per-frame drag re-renders stop at this shell.
function ChatNodeComponent({ data, selected }: NodeProps<ChatFlowNode>) {
  return (
    <ChatNodeBody
      node={data.node}
      selected={selected ?? false}
      flashKey={data.flashKey}
    />
  );
}

export const ChatNode = memo(ChatNodeComponent);
