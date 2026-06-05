// chatStore — the canonical, client-authoritative conversation state.
//
// Milestone 2 (data core only): types + persisted store + initial root node +
// selectNode and a placeholder add-node action. No AI calls, no canvas, no UI
// behavior yet — those land in later milestones (continue/branch/link/compare).
//
// Persisted to localStorage under "branchchat-storage" (see architecture.md
// "Persistence"): chats, the active chat id, and coding mode.

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ChatNode, ChatSessionState, Workspace } from "@/types/chat";

const STORAGE_KEY = "branchchat-storage";

const ROOT_ID = "root";
const ROOT_WELCOME =
  "Welcome to BranchChat. Select a node and continue, or branch to explore an alternate path.";

// ---------------------------------------------------------------------------
// id + path helpers
// ---------------------------------------------------------------------------

let nodeCounter = 0;
function createNodeId(): string {
  // Client-generated ids, e.g. node_1739...; counter avoids same-ms collisions.
  nodeCounter += 1;
  return `node_${Date.now()}_${nodeCounter}`;
}

function createChatId(): string {
  return `chat_${Date.now()}`;
}

// Path from root down to `nodeId`, inclusive. Walks parentId up, then reverses.
function computeActivePath(
  nodes: Record<string, ChatNode>,
  nodeId: string,
): string[] {
  const path: string[] = [];
  let current: string | null = nodeId;
  const guard = new Set<string>();
  while (current && nodes[current] && !guard.has(current)) {
    guard.add(current);
    path.push(current);
    current = nodes[current].parentId;
  }
  return path.reverse();
}

// ---------------------------------------------------------------------------
// initial state — one chat with a single root system node
// ---------------------------------------------------------------------------

function createRootNode(): ChatNode {
  return {
    id: ROOT_ID,
    parentId: null,
    role: "system",
    content: ROOT_WELCOME,
    childrenIds: [],
    createdAt: Date.now(),
  };
}

function createInitialChat(
  title = "New chat",
  workspace: Workspace = "personal",
): ChatSessionState {
  const root = createRootNode();
  const now = Date.now();
  return {
    id: createChatId(),
    title,
    workspace,
    nodes: { [root.id]: root },
    rootId: root.id,
    selectedNodeId: root.id,
    activePath: [root.id],
    collapsedNodeIds: [],
    journalEntries: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

export interface ChatStoreState {
  chats: Record<string, ChatSessionState>;
  activeChatId: string;
  codingMode: boolean;

  // Selection within the active chat.
  selectNode: (nodeId: string) => void;

  // Placeholder add-node action (Milestone 2). Creates a child node and links
  // it into the tree, then selects it. Real continue/branch + AI replies are
  // implemented in a later milestone; this exists so the tree can grow in
  // tests and so the canvas has something to render against.
  addNode: (
    parentId: string,
    init?: Partial<Omit<ChatNode, "id" | "parentId" | "childrenIds">>,
  ) => string | null;
}

// Mutate the active chat immutably and bump updatedAt.
function updateActiveChat(
  state: ChatStoreState,
  mutate: (chat: ChatSessionState) => ChatSessionState,
): Partial<ChatStoreState> {
  const chat = state.chats[state.activeChatId];
  if (!chat) return {};
  const next = mutate(chat);
  next.updatedAt = Date.now();
  return { chats: { ...state.chats, [chat.id]: next } };
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set) => {
      const initialChat = createInitialChat();
      return {
        chats: { [initialChat.id]: initialChat },
        activeChatId: initialChat.id,
        codingMode: false,

        selectNode: (nodeId) =>
          set((state) =>
            updateActiveChat(state, (chat) => {
              if (!chat.nodes[nodeId]) return chat;
              return {
                ...chat,
                selectedNodeId: nodeId,
                activePath: computeActivePath(chat.nodes, nodeId),
              };
            }),
          ),

        addNode: (parentId, init) => {
          let createdId: string | null = null;
          set((state) =>
            updateActiveChat(state, (chat) => {
              const parent = chat.nodes[parentId];
              if (!parent) return chat;

              const id = createNodeId();
              createdId = id;
              const node: ChatNode = {
                id,
                parentId,
                role: init?.role ?? "user",
                content: init?.content ?? "",
                childrenIds: [],
                createdAt: Date.now(),
                ...init,
              };

              const nodes: Record<string, ChatNode> = {
                ...chat.nodes,
                [id]: node,
                [parentId]: {
                  ...parent,
                  childrenIds: [...parent.childrenIds, id],
                },
              };

              return {
                ...chat,
                nodes,
                selectedNodeId: id,
                activePath: computeActivePath(nodes, id),
              };
            }),
          );
          return createdId;
        },
      };
    },
    {
      name: STORAGE_KEY,
      // Persist only data, not action functions.
      partialize: (state) => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
        codingMode: state.codingMode,
      }),
    },
  ),
);

// Dev affordance: confirm initialization from the browser console via
// `useChatStore.getState()`. Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { useChatStore: typeof useChatStore }).useChatStore =
    useChatStore;
}
