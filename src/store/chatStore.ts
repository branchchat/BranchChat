// chatStore — the canonical, client-authoritative conversation state.
//
// Milestone 4 (continue + branch): adds addUserMessage (linear continuation)
// and branchFromNode (alternate timeline), each creating a user node + a
// loading assistant node, then filling the assistant via a STUBBED reply.
// Real AI calls to /api/chat/* arrive in a later milestone; the request shape
// (history + truncation caps) mirrors the docs so the swap is mechanical.
//
// Persisted to localStorage under "branchchat-storage" (architecture.md
// "Persistence"): chats, the active chat id, and coding mode.

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  ChatApiError,
  isBackendConfigured,
  requestChatReply,
} from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { buildDemoChat } from "@/lib/demoChat";
import type {
  ChatNode,
  ChatSessionState,
  JournalEntry,
  ModelChoice,
  Workspace,
} from "@/types/chat";

const STORAGE_KEY = "branchchat-storage";

// Schema version of the persisted blob (todo "localStorage export/import
// versioning"). Bump when the persisted shape changes and chain a transform in
// `migratePersistedState`. v1 = the shape below; v0 = every pre-versioning
// save (zustand stamped those `version: 0` by default).
const PERSIST_VERSION = 1;

// What `partialize` writes to localStorage.
type PersistedChatState = Pick<
  ChatStoreState,
  "chats" | "activeChatId" | "codingMode"
>;

// Upgrade an older persisted blob to the current shape. Called by zustand only
// when the stored version differs from PERSIST_VERSION. v0 is shape-identical
// to v1, so it passes through untouched — never discard a session just because
// it predates versioning.
export function migratePersistedState(
  persistedState: unknown,
  version: number,
): PersistedChatState {
  switch (version) {
    case 0:
    default:
      return persistedState as PersistedChatState;
  }
}

const ROOT_ID = "root";
const ROOT_WELCOME =
  "Welcome to BranchChat. Select a node and continue, or branch to explore an alternate path.";

// History + message caps from README "History truncation".
const HISTORY_LIMITS = {
  standard: { maxMessages: 20, maxChars: 24_000 },
  coding: { maxMessages: 28, maxChars: 48_000 },
};
const MESSAGE_CHAR_CAP = { standard: 5_000, coding: 10_000 };

// Simulated latency so the loading state is visible with the stub backend.
const STUB_REPLY_DELAY_MS = 500;

export interface ProviderMessage {
  role: ChatNode["role"];
  content: string;
}

// ---------------------------------------------------------------------------
// id + path helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function createNodeId(): string {
  idCounter += 1;
  return `node_${Date.now()}_${idCounter}`;
}
function createChatId(): string {
  idCounter += 1;
  return `chat_${Date.now()}_${idCounter}`;
}
function createJournalId(): string {
  idCounter += 1;
  return `journal_${Date.now()}_${idCounter}`;
}
function createCommentId(): string {
  idCounter += 1;
  return `comment_${Date.now()}_${idCounter}`;
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

// The AI model a node answers with: the nearest ancestor (or own) override
// on the path back to root, or null for the app default. This is what makes
// model-specific branches inherit correctly — a branch started with model X
// keeps using X for every continuation, while sibling branches (which are
// not on this parent chain) are untouched. Deeper overrides win, so a GPT
// branch nested inside a Gemini branch answers with GPT.
export function resolveModelForNode(
  nodes: Record<string, ChatNode>,
  nodeId: string | null,
): ModelChoice | null {
  let current = nodeId;
  const guard = new Set<string>();
  while (current && nodes[current] && !guard.has(current)) {
    guard.add(current);
    const override = nodes[current].modelOverride;
    if (override) return override;
    current = nodes[current].parentId;
  }
  return null;
}

// Messages on the path from root to `leafId`, oldest first, trimmed to caps.
// Exported for layout/history tests.
export function buildHistoryForNode(
  nodes: Record<string, ChatNode>,
  leafId: string | null,
  codingMode: boolean,
): ProviderMessage[] {
  const limits = codingMode ? HISTORY_LIMITS.coding : HISTORY_LIMITS.standard;

  const chain: ChatNode[] = [];
  let current = leafId;
  const guard = new Set<string>();
  while (current && nodes[current] && !guard.has(current)) {
    guard.add(current);
    chain.push(nodes[current]);
    current = nodes[current].parentId;
  }
  chain.reverse();

  const messages: ProviderMessage[] = chain
    .filter((n) => !n.isLoading && n.content)
    .map((n) => ({ role: n.role, content: n.content }));

  // Keep the most recent messages within both the count and char budgets.
  const recent = messages.slice(-limits.maxMessages);
  const out: ProviderMessage[] = [];
  let total = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    total += recent[i].content.length;
    if (total > limits.maxChars && out.length > 0) break;
    out.unshift(recent[i]);
  }
  return out;
}

// Placeholder for the real provider call. Deterministic, references context.
function stubAssistantReply(
  userMessage: string,
  history: ProviderMessage[],
): string {
  const priorTurns = history.length;
  return (
    `Stubbed reply (no backend yet). You said: “${userMessage}”. ` +
    `I can see ${priorTurns} prior message${priorTurns === 1 ? "" : "s"} on ` +
    `this path. Real AI responses arrive once the backend is wired up.`
  );
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

// Create the user + loading-assistant pair under `parentId` and return the new
// chat plus the two ids. `branchMeta` decorates the user node (branch label /
// focus text). Returns null if the parent is missing.
function buildExchange(
  chat: ChatSessionState,
  parentId: string,
  message: string,
  branchMeta: Pick<ChatNode, "branchLabel" | "focusText" | "modelOverride">,
  codingMode: boolean,
): { chat: ChatSessionState; userId: string; assistantId: string } | null {
  const parent = chat.nodes[parentId];
  if (!parent) return null;

  const cap = codingMode ? MESSAGE_CHAR_CAP.coding : MESSAGE_CHAR_CAP.standard;
  const content = message.slice(0, cap);
  const now = Date.now();

  const userId = createNodeId();
  const assistantId = createNodeId();

  const userNode: ChatNode = {
    id: userId,
    parentId,
    role: "user",
    content,
    childrenIds: [assistantId],
    createdAt: now,
    codingMode: codingMode || undefined,
    ...branchMeta,
  };
  const assistantNode: ChatNode = {
    id: assistantId,
    parentId: userId,
    role: "assistant",
    content: "",
    childrenIds: [],
    isLoading: true,
    createdAt: now,
    codingMode: codingMode || undefined,
  };

  const nodes: Record<string, ChatNode> = {
    ...chat.nodes,
    [parentId]: { ...parent, childrenIds: [...parent.childrenIds, userId] },
    [userId]: userNode,
    [assistantId]: assistantNode,
  };

  return {
    chat: {
      ...chat,
      nodes,
      selectedNodeId: assistantId,
      activePath: computeActivePath(nodes, assistantId),
      updatedAt: now,
    },
    userId,
    assistantId,
  };
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

export interface ExchangeResult {
  userId: string;
  assistantId: string;
}

// A request to bring a node into view on the canvas. `ts` makes each request
// unique so re-opening the same node re-triggers the focus. Transient — not
// persisted (see partialize). Consumed and cleared by Canvas.tsx.
export interface FocusNodeRequest {
  chatId: string;
  nodeId: string;
  ts: number;
}

export interface ChatStoreState {
  chats: Record<string, ChatSessionState>;
  activeChatId: string;
  codingMode: boolean;

  // Pending "center this node on the canvas" request (set by openNode, e.g.
  // from search results); Canvas consumes it then calls clearFocusRequest.
  focusNodeRequest: FocusNodeRequest | null;

  // Node id a "Branch with model" action was invoked on (from a node's hover
  // action or the composer). The composer renders the ModelPicker dialog for
  // it. Transient — not persisted (see partialize).
  modelPickerFor: string | null;
  openModelPicker: (parentId: string) => void;
  closeModelPicker: () => void;

  // --- chat (workspace tab) management, driven by the Toolbar ---
  // Create a new empty chat and switch to it; returns the new chat id.
  createChat: (opts?: { title?: string; workspace?: Workspace }) => string;
  // Add a prebuilt sample branching conversation and switch to it; returns its
  // id. Available any time (not just first-run onboarding).
  loadDemoChat: () => string;
  // Make `chatId` the active chat (no-op if it doesn't exist).
  switchChat: (chatId: string) => void;
  // Rename `chatId`; empty/whitespace titles are ignored.
  renameChat: (chatId: string, title: string) => void;
  // Delete `chatId`. If it was active, fall back to the most-recent remaining
  // chat; deleting the last chat creates a fresh one so activeChatId always
  // points at a real chat.
  deleteChat: (chatId: string) => void;

  // Switch to `chatId`, select `nodeId` there, and request the canvas to center
  // it. Used by search-result navigation. No-op if chat/node is missing.
  openNode: (chatId: string, nodeId: string) => void;
  // Canvas calls this once it has centered the requested node.
  clearFocusRequest: () => void;

  selectNode: (nodeId: string) => void;

  // Linear continuation: append a user message under `parentId` (defaults to
  // the selected node) and request an assistant reply.
  addUserMessage: (
    message: string,
    parentId?: string,
  ) => ExchangeResult | null;

  // Branch: append a user message under `parentId` as an alternate timeline,
  // with a branch label (and optional focus excerpt), then request a reply.
  // `model` makes it a model-specific branch: the choice is stamped on the
  // branch's first user node and inherited by all continuations under it.
  branchFromNode: (
    parentId: string,
    message: string,
    opts?: { branchLabel?: string; focusText?: string; model?: ModelChoice },
  ) => ExchangeResult | null;

  // Re-request the reply for an existing (e.g. errored) assistant node.
  retryAssistant: (assistantId: string) => void;

  // --- node annotations (organize an exploration without spending quota) ---
  // Add a tag to a node (trimmed; deduped; no-op if empty or already present).
  addTag: (nodeId: string, tag: string) => void;
  removeTag: (nodeId: string, tag: string) => void;
  // Append a comment to a node (trimmed; no-op if empty).
  addComment: (nodeId: string, content: string) => void;
  removeComment: (nodeId: string, commentId: string) => void;

  // Low-level helper retained from Milestone 2 (used by tests/console).
  addNode: (
    parentId: string,
    init?: Partial<Omit<ChatNode, "id" | "parentId" | "childrenIds">>,
  ) => string | null;
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set, get) => {
      // Write the final reply (or an error message) into the assistant node.
      // `generatedBy` records which provider/model actually answered (from
      // the backend response) so the node UI can show it.
      const fillAssistant = (
        chatId: string,
        assistantId: string,
        content: string,
        isError: boolean,
        generatedBy?: { provider?: string; model?: string },
      ) =>
        set((state) => {
          const chat = state.chats[chatId];
          const node = chat?.nodes[assistantId];
          if (!chat || !node) return {};
          return {
            chats: {
              ...state.chats,
              [chat.id]: {
                ...chat,
                nodes: {
                  ...chat.nodes,
                  [assistantId]: {
                    ...node,
                    content,
                    isLoading: false,
                    isError: isError || undefined,
                    provider: generatedBy?.provider ?? node.provider,
                    model: generatedBy?.model ?? node.model,
                  },
                },
                updatedAt: Date.now(),
              },
            },
          };
        });

      // Request the reply for an existing loading assistant node whose parent
      // is the user message. History is the path up to (not including) that
      // user message; the message is sent separately, per README. Falls back
      // to a stub when no backend is configured so the app stays usable
      // local-first.
      const requestAssistantReply = async (
        chatId: string,
        userId: string,
        assistantId: string,
      ) => {
        const state = get();
        const chat = state.chats[chatId];
        const userNode = chat?.nodes[userId];
        if (!chat || !userNode) return;

        const codingMode = state.codingMode;
        const message = userNode.content;
        const history = buildHistoryForNode(
          chat.nodes,
          userNode.parentId,
          codingMode,
        );
        // Inherited model for this branch: the nearest override on the path
        // up from the user node (covers both "this branch was created with
        // model X" and "continuing inside such a branch"). Null = the
        // env-configured default provider, exactly the pre-feature behaviour.
        const branchModel = resolveModelForNode(chat.nodes, userId);

        try {
          let reply: string;
          let generatedBy: { provider?: string; model?: string } | undefined;
          if (isBackendConfigured()) {
            const result = await requestChatReply(
              {
                node_id: assistantId,
                message,
                history,
                linked_context: [],
                coding_mode: codingMode,
                model: branchModel?.model,
              },
              { provider: branchModel?.provider },
            );
            reply = result.reply;
            generatedBy = { provider: result.provider, model: result.model };
          } else {
            await new Promise((resolve) =>
              setTimeout(resolve, STUB_REPLY_DELAY_MS),
            );
            reply = stubAssistantReply(message, history);
            // Keep the branch's selection visible on nodes even in stub mode.
            generatedBy = branchModel ?? undefined;
          }
          fillAssistant(
            chatId,
            assistantId,
            reply || "(empty reply)",
            false,
            generatedBy,
          );
        } catch (err) {
          const detail =
            err instanceof ChatApiError
              ? err.message
              : "Something went wrong requesting the reply.";
          fillAssistant(chatId, assistantId, `⚠️ ${detail}`, true);
        } finally {
          // A reply consumed quota (and a 429 means the meter was stale) —
          // re-sync the header meter. No-op in stub mode.
          void useAuthStore.getState().refreshUsage();
        }
      };

      // Replace a node in the active chat via `patch(node)` and bump updatedAt,
      // optionally appending a journal entry. No-op if chat/node is missing or
      // `patch` returns null (lets callers skip writes, e.g. a duplicate tag).
      const patchActiveNode = (
        nodeId: string,
        patch: (node: ChatNode) => Partial<ChatNode> | null,
        journal?: Omit<JournalEntry, "id" | "createdAt">,
      ) =>
        set((state) => {
          const chat = state.chats[state.activeChatId];
          const node = chat?.nodes[nodeId];
          if (!chat || !node) return {};
          const updates = patch(node);
          if (!updates) return {};
          return {
            chats: {
              ...state.chats,
              [chat.id]: {
                ...chat,
                nodes: { ...chat.nodes, [nodeId]: { ...node, ...updates } },
                journalEntries: journal
                  ? [
                      ...chat.journalEntries,
                      { id: createJournalId(), createdAt: Date.now(), ...journal },
                    ]
                  : chat.journalEntries,
                updatedAt: Date.now(),
              },
            },
          };
        });

      const initialChat = createInitialChat();

      return {
        chats: { [initialChat.id]: initialChat },
        activeChatId: initialChat.id,
        codingMode: false,
        focusNodeRequest: null,
        modelPickerFor: null,

        openModelPicker: (parentId) =>
          set((state) => {
            const chat = state.chats[state.activeChatId];
            if (!chat || !chat.nodes[parentId]) return {};
            return { modelPickerFor: parentId };
          }),

        closeModelPicker: () => set({ modelPickerFor: null }),

        createChat: (opts) => {
          const chat = createInitialChat(
            opts?.title ?? "New chat",
            opts?.workspace ?? "personal",
          );
          set((state) => ({
            chats: { ...state.chats, [chat.id]: chat },
            activeChatId: chat.id,
          }));
          return chat.id;
        },

        loadDemoChat: () => {
          const chat = buildDemoChat({
            node: createNodeId,
            chat: createChatId,
            journal: createJournalId,
            comment: createCommentId,
          });
          set((state) => ({
            chats: { ...state.chats, [chat.id]: chat },
            activeChatId: chat.id,
          }));
          return chat.id;
        },

        switchChat: (chatId) =>
          set((state) =>
            state.chats[chatId] ? { activeChatId: chatId } : {},
          ),

        renameChat: (chatId, title) => {
          const next = title.trim();
          if (!next) return;
          set((state) => {
            const chat = state.chats[chatId];
            if (!chat) return {};
            return {
              chats: {
                ...state.chats,
                [chatId]: { ...chat, title: next, updatedAt: Date.now() },
              },
            };
          });
        },

        deleteChat: (chatId) =>
          set((state) => {
            if (!state.chats[chatId]) return {};
            const chats = { ...state.chats };
            delete chats[chatId];

            // Never leave the app with zero chats / a dangling activeChatId.
            if (Object.keys(chats).length === 0) {
              const fresh = createInitialChat();
              return { chats: { [fresh.id]: fresh }, activeChatId: fresh.id };
            }
            let activeChatId = state.activeChatId;
            if (activeChatId === chatId) {
              // Fall back to the most recently updated remaining chat.
              activeChatId = Object.values(chats).sort(
                (a, b) => b.updatedAt - a.updatedAt,
              )[0].id;
            }
            return { chats, activeChatId };
          }),

        openNode: (chatId, nodeId) =>
          set((state) => {
            const chat = state.chats[chatId];
            if (!chat || !chat.nodes[nodeId]) return {};
            return {
              activeChatId: chatId,
              // Note: no updatedAt bump — opening from search shouldn't
              // reorder the chat list.
              chats: {
                ...state.chats,
                [chatId]: {
                  ...chat,
                  selectedNodeId: nodeId,
                  activePath: computeActivePath(chat.nodes, nodeId),
                },
              },
              focusNodeRequest: { chatId, nodeId, ts: Date.now() },
            };
          }),

        clearFocusRequest: () => set({ focusNodeRequest: null }),

        selectNode: (nodeId) =>
          set((state) => {
            const chat = state.chats[state.activeChatId];
            if (!chat || !chat.nodes[nodeId]) return {};
            return {
              chats: {
                ...state.chats,
                [chat.id]: {
                  ...chat,
                  selectedNodeId: nodeId,
                  activePath: computeActivePath(chat.nodes, nodeId),
                  updatedAt: Date.now(),
                },
              },
            };
          }),

        addUserMessage: (message, parentId) => {
          const text = message.trim();
          if (!text) return null;

          let result: ExchangeResult | null = null;
          set((state) => {
            const chat = state.chats[state.activeChatId];
            if (!chat) return {};
            const built = buildExchange(
              chat,
              parentId ?? chat.selectedNodeId,
              text,
              {},
              state.codingMode,
            );
            if (!built) return {};
            result = { userId: built.userId, assistantId: built.assistantId };
            return { chats: { ...state.chats, [chat.id]: built.chat } };
          });

          const settled = result as ExchangeResult | null;
          if (settled) {
            void requestAssistantReply(
              get().activeChatId,
              settled.userId,
              settled.assistantId,
            );
          }
          return settled;
        },

        branchFromNode: (parentId, message, opts) => {
          const text = message.trim();
          if (!text) return null;

          let result: ExchangeResult | null = null;
          set((state) => {
            const chat = state.chats[state.activeChatId];
            const parent = chat?.nodes[parentId];
            if (!chat || !parent) return {};

            const branchLabel =
              opts?.branchLabel ?? `Branch ${parent.childrenIds.length + 1}`;
            const built = buildExchange(
              chat,
              parentId,
              text,
              {
                branchLabel,
                focusText: opts?.focusText,
                modelOverride: opts?.model,
              },
              state.codingMode,
            );
            if (!built) return {};

            const modelNote = opts?.model
              ? ` using ${opts.model.label ?? opts.model.model}`
              : "";
            const journalEntries: JournalEntry[] = [
              ...built.chat.journalEntries,
              {
                id: createJournalId(),
                type: "branch",
                message: `Branched from "${parent.content.slice(0, 40)}" as ${branchLabel}${modelNote}`,
                nodeId: built.userId,
                createdAt: Date.now(),
              },
            ];

            result = { userId: built.userId, assistantId: built.assistantId };
            return {
              chats: {
                ...state.chats,
                [chat.id]: { ...built.chat, journalEntries },
              },
            };
          });

          const settled = result as ExchangeResult | null;
          if (settled) {
            void requestAssistantReply(
              get().activeChatId,
              settled.userId,
              settled.assistantId,
            );
          }
          return settled;
        },

        retryAssistant: (assistantId) => {
          const state = get();
          const chat = state.chats[state.activeChatId];
          const node = chat?.nodes[assistantId];
          if (!chat || !node || node.role !== "assistant" || !node.parentId) {
            return;
          }
          const userId = node.parentId;

          set((s) => {
            const c = s.chats[s.activeChatId];
            const n = c?.nodes[assistantId];
            if (!c || !n) return {};
            return {
              chats: {
                ...s.chats,
                [c.id]: {
                  ...c,
                  nodes: {
                    ...c.nodes,
                    [assistantId]: {
                      ...n,
                      content: "",
                      isLoading: true,
                      isError: undefined,
                    },
                  },
                  updatedAt: Date.now(),
                },
              },
            };
          });

          void requestAssistantReply(chat.id, userId, assistantId);
        },

        addTag: (nodeId, tag) => {
          const t = tag.trim();
          if (!t) return;
          patchActiveNode(
            nodeId,
            (node) =>
              (node.tags ?? []).includes(t)
                ? null
                : { tags: [...(node.tags ?? []), t] },
            { type: "tag", message: `Tagged "${t}"`, nodeId },
          );
        },

        removeTag: (nodeId, tag) =>
          patchActiveNode(nodeId, (node) => {
            const tags = (node.tags ?? []).filter((x) => x !== tag);
            return { tags: tags.length ? tags : undefined };
          }),

        addComment: (nodeId, content) => {
          const text = content.trim();
          if (!text) return;
          patchActiveNode(
            nodeId,
            (node) => ({
              comments: [
                ...(node.comments ?? []),
                { id: createCommentId(), content: text, createdAt: Date.now() },
              ],
            }),
            { type: "note", message: "Added a comment", nodeId },
          );
        },

        removeComment: (nodeId, commentId) =>
          patchActiveNode(nodeId, (node) => {
            const comments = (node.comments ?? []).filter(
              (c) => c.id !== commentId,
            );
            return { comments: comments.length ? comments : undefined };
          }),

        addNode: (parentId, init) => {
          let createdId: string | null = null;
          set((state) => {
            const chat = state.chats[state.activeChatId];
            const parent = chat?.nodes[parentId];
            if (!chat || !parent) return {};

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
              chats: {
                ...state.chats,
                [chat.id]: {
                  ...chat,
                  nodes,
                  selectedNodeId: id,
                  activePath: computeActivePath(nodes, id),
                  updatedAt: Date.now(),
                },
              },
            };
          });
          return createdId;
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: PERSIST_VERSION,
      migrate: migratePersistedState,
      partialize: (state) => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
        codingMode: state.codingMode,
      }),
      // Replies aren't persisted mid-flight; clear any stuck loading flags so a
      // reload doesn't leave a node spinning forever.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        for (const chat of Object.values(state.chats)) {
          for (const node of Object.values(chat.nodes)) {
            if (node.isLoading) {
              node.isLoading = false;
              if (!node.content) node.content = "(reply was interrupted)";
            }
          }
        }
      },
    },
  ),
);

// Dev affordance: inspect via `useChatStore.getState()` in the console.
// Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { useChatStore: typeof useChatStore }).useChatStore =
    useChatStore;
}
