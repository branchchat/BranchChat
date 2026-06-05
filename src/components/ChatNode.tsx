// Per-node UI on the canvas. A custom React Flow node that renders one
// ChatNode from the store as a shadcn Card with a role badge and its content.
//
// Milestone 3 scope: render + selection highlight only. Node-level actions
// (continue, branch, retry, tag, context handles) land in later milestones.

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { NODE_WIDTH } from "@/lib/treeLayout";
import type { ChatNode as ChatNodeType, ChatRole } from "@/types/chat";

export type ChatNodeData = { node: ChatNodeType };
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
  const { node } = data;
  const isRoot = node.parentId === null;

  return (
    <Card
      style={{ width: NODE_WIDTH }}
      className={cn(
        "gap-2 py-3 text-left transition-shadow",
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
          <Badge variant={ROLE_VARIANT[node.role]}>{ROLE_LABEL[node.role]}</Badge>
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
      </CardContent>

      {/* Outgoing edge to children. */}
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </Card>
  );
}

export const ChatNode = memo(ChatNodeComponent);
