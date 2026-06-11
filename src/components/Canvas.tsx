// Canvas — the infinite React Flow graph for the active chat.
//
// Reads the conversation tree from chatStore, converts ChatNode records into
// flow nodes/edges, runs the tidy tree layout, and renders them with pan/zoom,
// background, controls, and a minimap. Clicking a node selects it in the store.
//
// Nodes are draggable: the tree layout assigns the default slot, a drag
// override is tracked locally while the pointer moves (our `nodes` prop is
// derived state, so React Flow needs the position changes applied somewhere
// to render movement) and persisted to the store on drop. A node with a
// stored position keeps it; everything else keeps following the layout.
//
// Context links: dragging from a node's right port to another node's left
// port links the source's exchange into the target's branch prompts (dashed
// animated edge; click the edge to unlink). Tree edges are not connectable.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node as FlowNode,
  type NodeChange,
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
  const setNodePosition = useChatStore((s) => s.setNodePosition);
  const addContextLink = useChatStore((s) => s.addContextLink);
  const removeContextLink = useChatStore((s) => s.removeContextLink);
  const focusNodeRequest = useChatStore((s) => s.focusNodeRequest);
  const clearFocusRequest = useChatStore((s) => s.clearFocusRequest);
  // In-flight drag positions (per node id). The store only learns the final
  // position on drop; this keeps the node under the pointer meanwhile.
  // Tagged with the chat they belong to so stale overrides can't leak across
  // chat switches (mismatched tag = ignored, no reset effect needed).
  const [drag, setDrag] = useState<{
    chatId: string;
    map: Record<string, { x: number; y: number }>;
  }>({ chatId: "", map: {} });
  const dragOverrides = useMemo(
    () => (drag.chatId === activeChatId ? drag.map : {}),
    [drag, activeChatId],
  );
  // Measured node sizes reported by React Flow ("dimensions" changes). A
  // controlled flow must echo these back onto its node objects: React Flow
  // hides any node it considers unmeasured, and the dragged node's object is
  // replaced every frame — without `measured` re-attached, it was hidden and
  // re-measured per frame, flashing its text while dragging.
  const [measured, setMeasured] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const rfRef = useRef<ReactFlowInstance<ChatFlowNode, Edge> | null>(null);
  // Node to briefly pulse after a search-result open ({id, ts}); ts keys the
  // animation so re-opening the same node replays it.
  const [flash, setFlash] = useState<{ id: string; ts: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When the focus effect last centered the canvas (guards the refit timer).
  const lastCenterTs = useRef(0);

  const { nodes: layoutNodes, edges } = useMemo(() => {
    if (!chat) return { nodes: [] as ChatFlowNode[], edges: [] as Edge[] };

    const positions = computeTreeLayout(chat.nodes, chat.rootId);
    const flowNodes: ChatFlowNode[] = Object.values(chat.nodes).map((n) => ({
      id: n.id,
      type: "chat",
      // Stored position beats the layout slot.
      position: n.position ?? positions[n.id] ?? { x: 0, y: 0 },
      data: {
        node: n,
        flashKey: flash && flash.id === n.id ? flash.ts : undefined,
      },
      selected: n.id === chat.selectedNodeId,
    }));

    const flowEdges: Edge[] = [];
    for (const n of Object.values(chat.nodes)) {
      // Tree edges (parent → child).
      if (n.parentId) {
        flowEdges.push({
          id: `${n.parentId}->${n.id}`,
          source: n.parentId,
          target: n.id,
        });
      }
      // Context links (cross-branch, dashed/animated): `n` pulls the linked
      // node's exchange into its branch's prompts. Click the edge to unlink.
      for (const srcId of n.contextNodeIds ?? []) {
        if (!chat.nodes[srcId]) continue;
        flowEdges.push({
          id: `ctx:${srcId}->${n.id}`,
          source: srcId,
          target: n.id,
          sourceHandle: "ctx-out",
          targetHandle: "ctx-in",
          animated: true,
          style: { stroke: "var(--muted-foreground)", opacity: 0.7 },
        });
      }
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [chat, flash]);

  // Drag-in-progress positions and measured sizes are layered on in a second
  // pass that reuses the untouched node objects. Rebuilding every node per
  // pointer move (the old single memo) gave each one a fresh `data` object
  // each frame, defeating ChatNode's memo and re-running the Markdown
  // renderer constantly — the text visibly blinked while dragging.
  const nodes = useMemo(() => {
    if (
      Object.keys(dragOverrides).length === 0 &&
      Object.keys(measured).length === 0
    ) {
      return layoutNodes;
    }
    return layoutNodes.map((n) => {
      const dims = measured[n.id];
      const dragPos = dragOverrides[n.id];
      if (!dims && !dragPos) return n;
      const out: ChatFlowNode = { ...n };
      if (dims) out.measured = dims;
      if (dragPos) {
        out.position = dragPos;
        out.dragging = true;
      }
      return out;
    });
  }, [layoutNodes, dragOverrides, measured]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: FlowNode) => selectNode(node.id),
    [selectNode],
  );

  // Apply position changes from drags to the local override map and record
  // measured dimensions (selection changes are managed elsewhere).
  const onNodesChange = useCallback(
    (changes: NodeChange<ChatFlowNode>[]) => {
      setMeasured((prev) => {
        let next = prev;
        for (const change of changes) {
          if (change.type !== "dimensions" || !change.dimensions) continue;
          const cur = next[change.id];
          if (
            cur &&
            cur.width === change.dimensions.width &&
            cur.height === change.dimensions.height
          ) {
            continue;
          }
          if (next === prev) next = { ...prev };
          next[change.id] = change.dimensions;
        }
        return next;
      });
      setDrag((prev) => {
        let map = prev.chatId === activeChatId ? prev.map : {};
        let changed = prev.chatId !== activeChatId;
        for (const change of changes) {
          if (change.type === "position" && change.position) {
            if (!changed) {
              map = { ...map };
              changed = true;
            }
            map[change.id] = change.position;
          }
        }
        return changed ? { chatId: activeChatId, map } : prev;
      });
    },
    [activeChatId],
  );

  // Completed connection between two context ports = a new context link:
  // the TARGET node's branch will include the SOURCE node's exchange in its
  // prompts. The tree's top/bottom handles aren't connectable, so only
  // ctx-out → ctx-in pairs can arrive here.
  const onConnect = useCallback(
    (conn: Connection) => {
      if (
        conn.sourceHandle === "ctx-out" &&
        conn.targetHandle === "ctx-in" &&
        conn.source &&
        conn.target &&
        conn.source !== conn.target
      ) {
        addContextLink(conn.target, conn.source);
      }
    },
    [addContextLink],
  );

  // Clicking a dashed context edge removes the link (tree edges ignore it).
  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (edge.targetHandle !== "ctx-in") return;
      event.stopPropagation();
      removeContextLink(edge.target, edge.source);
    },
    [removeContextLink],
  );

  // Drop: persist to the store (the node keeps this position from now on)
  // and clear the in-flight override so the store value takes over.
  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: FlowNode) => {
      setNodePosition(node.id, node.position);
      setDrag((prev) => {
        if (!(node.id in prev.map)) return prev;
        const map = { ...prev.map };
        delete map[node.id];
        return { ...prev, map };
      });
    },
    [setNodePosition],
  );

  // Refit the canvas when switching chats: each chat has its own geometry,
  // and keeping the previous chat's pan/zoom often left the new tree
  // off-screen (e.g. "Load demo conversation" landed zoomed into a corner).
  // Skipped when a focus request pans instead (search-result opens center
  // their own node; lastCenterTs covers the race where that pan already ran
  // before this deferred refit fires).
  useEffect(() => {
    const pendingFocus = useChatStore.getState().focusNodeRequest;
    if (pendingFocus?.chatId === activeChatId) return;
    // Defer a frame so the new chat's nodes are mounted and measured first.
    const t = setTimeout(() => {
      if (Date.now() - lastCenterTs.current < 1000) return;
      void rfRef.current?.fitView({ padding: 0.2, maxZoom: 1 });
    }, 50);
    return () => clearTimeout(t);
  }, [activeChatId]);

  // Center the canvas on a focus request (e.g. a clicked search result) and
  // pulse the node, then clear the request so later re-renders (new messages,
  // layout shifts) don't re-pan.
  useEffect(() => {
    if (!focusNodeRequest || focusNodeRequest.chatId !== activeChatId) return;
    const target = nodes.find((n) => n.id === focusNodeRequest.nodeId);
    if (!target || !rfRef.current) return;
    void rfRef.current.setCenter(
      target.position.x + NODE_WIDTH / 2,
      target.position.y + NODE_HALF_HEIGHT,
      { zoom: 1, duration: 400 },
    );
    lastCenterTs.current = Date.now();
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
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      onEdgeClick={onEdgeClick}
      connectionRadius={30}
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
