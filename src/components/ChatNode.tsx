// Per-node UI on the canvas. A custom React Flow node that renders one
// ChatNode from the store as a shadcn Card with a role badge and its content.
//
// Renders + selection highlight, a retry action on errored assistant nodes,
// a model badge on AI replies (which model generated this response), and a
// hover "Branch with model" action that opens the ModelPicker for this node.

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Bot, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NodeAnnotations } from "@/components/NodeAnnotations";
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

function ChatNodeComponent({ data, selected }: NodeProps<ChatFlowNode>) {
  const { node, flashKey } = data;
  const isRoot = node.parentId === null;
  const retryAssistant = useChatStore((s) => s.retryAssistant);
  const selectNode = useChatStore((s) => s.selectNode);
  const openModelPicker = useChatStore((s) => s.openModelPicker);

  // Which model generated this reply (assistant nodes, stamped from the
  // backend response). Label resolves via the cached catalog, raw id before
  // the catalog loads.
  const generatedBy =
    node.role === "assistant" && !node.isLoading
      ? modelLabel(node.provider, node.model)
      : null;

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
        {/* Incoming edge from parent (root has no parent). */}
        {!isRoot && (
          <Handle type="target" position={Position.Top} className="!bg-border" />
        )}

        <CardHeader className="px-3">
          <CardTitle className="flex items-center gap-2 text-xs font-medium">
            <Badge variant={ROLE_VARIANT[node.role]}>
              {ROLE_LABEL[node.role]}
            </Badge>
            {node.branchLabel && (
              <span className="text-muted-foreground">{node.branchLabel}</span>
            )}
            {generatedBy && (
              <Badge variant="outline" className="ml-auto font-normal">
                {generatedBy}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-3">
          {node.isLoading ? (
            <p className="text-sm text-muted-foreground italic">Thinking…</p>
          ) : (
            <p
              className={cn(
                "line-clamp-6 text-sm whitespace-pre-wrap text-foreground",
                node.isError && "text-destructive",
              )}
            >
              {node.content || (
                <span className="text-muted-foreground italic">Empty</span>
              )}
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

          {/* Tags + comments (organize without spending quota). Hidden while a
              reply is streaming; the root system node isn't annotatable. */}
          {!node.isLoading && !isRoot && <NodeAnnotations node={node} />}
        </CardContent>

        {/* Outgoing edge to children. */}
        <Handle type="source" position={Position.Bottom} className="!bg-border" />
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
    </div>
  );
}

export const ChatNode = memo(ChatNodeComponent);
