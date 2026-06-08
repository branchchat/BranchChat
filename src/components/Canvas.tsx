// Canvas — the infinite React Flow graph for the active chat.
//
// Reads the conversation tree from chatStore, converts ChatNode records into
// flow nodes/edges, runs the tidy tree layout, and renders them with pan/zoom,
// background, controls, and a minimap. Clicking a node selects it in the store.
//
// Milestone 3 scope: render + select. Nodes are auto-laid-out and not yet
// draggable; continue/branch/context-link interactions come later.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node as FlowNode,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useChatStore } from "@/store/chatStore";
import { computeTreeLayout, NODE_WIDTH } from "@/lib/treeLayout";
import { ChatNode, type ChatFlowNode } from "@/components/ChatNode";

const nodeTypes = { chat: ChatNode };

// Nominal half-height for centering math (real heights vary with content).
const NODE_HALF_HEIGHT = 60;

export function Canvas() {
  const chat = useChatStore((s) => s.chats[s.activeChatId]);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const selectNode = useChatStore((s) => s.selectNode);
  const focusNodeRequest = useChatStore((s) => s.focusNodeRequest);
  const clearFocusRequest = useChatStore((s) => s.clearFocusRequest);
  const rfRef = useRef<ReactFlowInstance<ChatFlowNode, Edge> | null>(null);
  // Node to briefly pulse after a search-result open ({id, ts}); ts keys the
  // animation so re-opening the same node replays it.
  const [flash, setFlash] = useState<{ id: string; ts: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { nodes, edges } = useMemo(() => {
    if (!chat) return { nodes: [] as ChatFlowNode[], edges: [] as Edge[] };

    const positions = computeTreeLayout(chat.nodes, chat.rootId);
    const flowNodes: ChatFlowNode[] = Object.values(chat.nodes).map((n) => ({
      id: n.id,
      type: "chat",
      position: positions[n.id] ?? { x: 0, y: 0 },
      data: {
        node: n,
        flashKey: flash && flash.id === n.id ? flash.ts : undefined,
      },
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
  }, [chat, flash]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: FlowNode) => selectNode(node.id),
    [selectNode],
  );

  // Center the canvas on a focus request (e.g. a clicked search result) and
  // pulse the node, then clear the request so later re-renders (new messages,
  // layout shifts) don't re-pan.
  useEffect(() => {
    if (!focusNodeRequest || focusNodeRequest.chatId !== activeChatId) return;
    const target = nodes.find((n) => n.id === focusNodeRequest.nodeId);
    if (!target || !rfRef.current) return;
    rfRef.current.setCenter(
      target.position.x + NODE_WIDTH / 2,
      target.position.y + NODE_HALF_HEIGHT,
      { zoom: 1, duration: 400 },
    );
    setFlash({ id: focusNodeRequest.nodeId, ts: focusNodeRequest.ts });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1200);
    clearFocusRequest();
  }, [focusNodeRequest, activeChatId, nodes, clearFocusRequest]);

  // Clear any pending flash timer on unmount.
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  if (!chat) return null;

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onInit={(instance) => (rfRef.current = instance)}
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
