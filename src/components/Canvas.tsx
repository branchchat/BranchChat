// Canvas — the infinite React Flow graph for the active chat.
//
// Reads the conversation tree from chatStore, converts ChatNode records into
// flow nodes/edges, runs the tidy tree layout, and renders them with pan/zoom,
// background, controls, and a minimap. Clicking a node selects it in the store.
//
// Milestone 3 scope: render + select. Nodes are auto-laid-out and not yet
// draggable; continue/branch/context-link interactions come later.

import { useCallback, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node as FlowNode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useChatStore } from "@/store/chatStore";
import { computeTreeLayout } from "@/lib/treeLayout";
import { ChatNode, type ChatFlowNode } from "@/components/ChatNode";

const nodeTypes = { chat: ChatNode };

export function Canvas() {
  const chat = useChatStore((s) => s.chats[s.activeChatId]);
  const selectNode = useChatStore((s) => s.selectNode);

  const { nodes, edges } = useMemo(() => {
    if (!chat) return { nodes: [] as ChatFlowNode[], edges: [] as Edge[] };

    const positions = computeTreeLayout(chat.nodes, chat.rootId);
    const flowNodes: ChatFlowNode[] = Object.values(chat.nodes).map((n) => ({
      id: n.id,
      type: "chat",
      position: positions[n.id] ?? { x: 0, y: 0 },
      data: { node: n },
      selected: n.id === chat.selectedNodeId,
    }));

    const flowEdges: Edge[] = Object.values(chat.nodes)
      .filter((n) => n.parentId)
      .map((n) => ({
        id: `${n.parentId}->${n.id}`,
        source: n.parentId as string,
        target: n.id,
      }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [chat]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: FlowNode) => selectNode(node.id),
    [selectNode],
  );

  if (!chat) return null;

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      nodesDraggable={false}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}
