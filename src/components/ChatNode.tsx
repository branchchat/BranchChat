// Per-node UI on the canvas. A custom React Flow node that renders one
// ChatNode from the store as a shadcn Card with a role badge and its content.
//
// Renders + selection highlight, plus a retry action on errored assistant
// nodes. Other node-level actions (continue, branch, tag, context handles)
// land in later milestones.

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="relative" style={{ width: NODE_WIDTH }}>
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
        </CardContent>

        {/* Outgoing edge to children. */}
        <Handle type="source" position={Position.Bottom} className="!bg-border" />
      </Card>
    </div>
  );
}

export const ChatNode = memo(ChatNodeComponent);
