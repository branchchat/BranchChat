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
  type AttachmentPayload,
  type LinkedContextBlock,
} from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { DEMO_CHATS, type DemoKind } from "@/lib/demoChat";
import { parseSession } from "@/lib/sessionTransfer";
import { addTombstone } from "@/lib/syncTombstones";
import type {
  ChatNode,
  ChatSessionState,
  JournalEntry,
  ModelChoice,
  Workspace,
} from "@/types/chat";

const STORAGE_KEY = "branchchat-storage";

// Attachment BYTES for messages whose reply is still pending, keyed by user
// node id. Deliberately memory-only: the node persists name/type metadata for
// display, but base64 payloads must never reach localStorage or the sync
// blob. Consumed (and dropped) when the reply succeeds; kept across retries;
// lost on reload — a retried node then re-sends text only.
const pendingAttachments = new Map<string, AttachmentPayload[]>();

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

// Backend trims to 4 blocks server-side (MAX_LINKED_CONTEXT_BLOCKS); mirror
// the cap here so what the user "linked" is what actually reaches the model.
export const MAX_LINKED_CONTEXT_BLOCKS = 4;

// Nearest branch label walking up from `id` (the label lives on the node that
// STARTS a branch); undefined when the path back to root is unlabeled.
function nearestBranchLabel(
  nodes: Record<string, ChatNode>,
  id: string,
): string | undefined {
  let current: string | null = id;
  const guard = new Set<string>();
  while (current && nodes[current] && !guard.has(current)) {
    guard.add(current);
    const label = nodes[current].branchLabel;
    if (label) return label;
    current = nodes[current].parentId;
  }
  return undefined;
}

// linked_context payload for a send whose user message is `userId`: walk the
// root→user path, gather each node's contextNodeIds in path order (deduped),
// and emit a block per source. Sources already ON the path are skipped (their
// text is in `history`); an assistant source brings its parent user message
// along so the model sees the question that produced it. Exported for tests.
export function buildLinkedContextBlocks(
  nodes: Record<string, ChatNode>,
  userId: string,
): LinkedContextBlock[] {
  const path: ChatNode[] = [];
  let current: string | null = userId;
  const guard = new Set<string>();
  while (current && nodes[current] && !guard.has(current)) {
    guard.add(current);
    path.push(nodes[current]);
    current = nodes[current].parentId;
  }
  path.reverse(); // root → user

  const pathIds = new Set(path.map((n) => n.id));
  const blocks: LinkedContextBlock[] = [];
  const seen = new Set<string>();
  for (const node of path) {
    for (const srcId of node.contextNodeIds ?? []) {
      if (seen.has(srcId) || pathIds.has(srcId)) continue;
      seen.add(srcId);
      const src = nodes[srcId];
      if (!src || src.isLoading || !src.content || src.role === "system") {
        continue;
      }
      const messages: ProviderMessage[] = [];
      const parent = src.parentId ? nodes[src.parentId] : undefined;
      if (src.role === "assistant" && parent?.role === "user" && parent.content) {
        messages.push({ role: "user", content: parent.content });
      }
      messages.push({ role: src.role, content: src.content });
      blocks.push({
        source_node_id: srcId,
        source_label: nearestBranchLabel(nodes, srcId),
        messages,
      });
      if (blocks.length >= MAX_LINKED_CONTEXT_BLOCKS) return blocks;
    }
  }
  return blocks;
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
  branchMeta: Pick<
    ChatNode,
    "branchLabel" | "focusText" | "modelOverride" | "attachments"
  >,
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

  // Branch-compare overlay (compare two endpoints side by side). Transient —
  // not persisted (see partialize).
  compareOpen: boolean;
  openCompare: () => void;
  closeCompare: () => void;

  // Focused reading view of the selected path (root→selected as a transcript).
  // Transient — not persisted (see partialize).
  focusViewOpen: boolean;
  openFocusView: () => void;
  closeFocusView: () => void;

  // --- chat (workspace tab) management, driven by the Toolbar ---
  // Create a new empty chat and switch to it; returns the new chat id.
  createChat: (opts?: { title?: string; workspace?: Workspace }) => string;
  // Add a prebuilt sample branching conversation and switch to it; returns its
  // id. Available any time (not just first-run onboarding). `kind` picks one
  // of the DEMO_CHATS builders; omitted = the intro (Kyoto) demo.
  loadDemoChat: (kind?: DemoKind) => string;
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

  // Persist a node's canvas position after a drag (overrides the tree
  // layout's computed slot for that node from then on).
  setNodePosition: (
    nodeId: string,
    position: { x: number; y: number },
  ) => void;

  // Linear continuation: append a user message under `parentId` (defaults to
  // the selected node) and request an assistant reply. Attachments ride with
  // this message only (bytes go to the provider; the node keeps metadata).
  addUserMessage: (
    message: string,
    parentId?: string,
    opts?: { attachments?: AttachmentPayload[] },
  ) => ExchangeResult | null;

  // Branch: append a user message under `parentId` as an alternate timeline,
  // with a branch label (and optional focus excerpt), then request a reply.
  // `model` makes it a model-specific branch: the choice is stamped on the
  // branch's first user node and inherited by all continuations under it.
  branchFromNode: (
    parentId: string,
    message: string,
    opts?: {
      branchLabel?: string;
      focusText?: string;
      model?: ModelChoice;
      attachments?: AttachmentPayload[];
    },
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

  // --- cross-branch context links ---
  // Link `sourceNodeId`'s exchange into the branch containing `nodeId`: every
  // later send on a path through `nodeId` includes the source as a
  // linked_context block. Deduped; self-links and unknown ids are no-ops.
  addContextLink: (nodeId: string, sourceNodeId: string) => void;
  removeContextLink: (nodeId: string, sourceNodeId: string) => void;

  // Import a conversation from a session-export JSON string: validates +
  // normalizes it (see sessionTransfer), assigns a fresh chat id, and switches
  // to it. Returns the new chat id; throws Error (user-facing message) on a
  // malformed file.
  importChat: (text: string) => string;

  // Upsert a chat pulled from server-side sync (see lib/sync.ts), KEEPING its
  // chat id so the same conversation maps to one row across devices. Skips
  // (returns false) when the local copy is same-or-newer — last-write-wins.
  // Unlike importChat it does not switch the active chat.
  applySyncedChat: (
    chatId: string,
    payload: Record<string, unknown>,
    remoteUpdatedAt: number,
  ) => boolean;

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

        // Bytes for this message, if the reply hasn't succeeded yet (memory-
        // only — survives retries, not reloads).
        const attachments = pendingAttachments.get(userId);

        try {
          let reply: string;
          let generatedBy: { provider?: string; model?: string } | undefined;
          if (isBackendConfigured()) {
            const result = await requestChatReply(
              {
                node_id: assistantId,
                message,
                history,
                // Cross-branch links anywhere on this path pull the linked
                // exchanges into the system prompt (backend formats them).
                linked_context: buildLinkedContextBlocks(chat.nodes, userId),
                coding_mode: codingMode,
                attachments,
                model: branchModel?.model,
              },
              { provider: branchModel?.provider },
            );
            reply = result.reply;
            generatedBy = { provider: result.provider, model: result.model };
            pendingAttachments.delete(userId);
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

        compareOpen: false,
        openCompare: () => set({ compareOpen: true }),
        closeCompare: () => set({ compareOpen: false }),

        focusViewOpen: false,
        openFocusView: () => set({ focusViewOpen: true }),
        closeFocusView: () => set({ focusViewOpen: false }),

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

        loadDemoChat: (kind) => {
          const demo =
            DEMO_CHATS.find((d) => d.kind === kind) ?? DEMO_CHATS[0];
          const chat = demo.build({
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

        deleteChat: (chatId) => {
          const doomed = get().chats[chatId];
          if (!doomed) return;
          // Remember the deliberate delete (with the version it superseded) so
          // sync tombstones the server copy and never restores it. A wiped
          // browser has no tombstone, so its restore on next pull still works.
          addTombstone(chatId, doomed.updatedAt);
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
          });
        },

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

        setNodePosition: (nodeId, position) =>
          patchActiveNode(nodeId, () => ({ position })),

        addUserMessage: (message, parentId, opts) => {
          const text = message.trim();
          if (!text) return null;

          const files = opts?.attachments ?? [];
          let result: ExchangeResult | null = null;
          set((state) => {
            const chat = state.chats[state.activeChatId];
            if (!chat) return {};
            const built = buildExchange(
              chat,
              parentId ?? chat.selectedNodeId,
              text,
              files.length
                ? {
                    attachments: files.map((f) => ({
                      name: f.name,
                      mediaType: f.media_type,
                    })),
                  }
                : {},
              state.codingMode,
            );
            if (!built) return {};
            result = { userId: built.userId, assistantId: built.assistantId };
            return { chats: { ...state.chats, [chat.id]: built.chat } };
          });

          const settled = result as ExchangeResult | null;
          if (settled) {
            if (files.length) pendingAttachments.set(settled.userId, files);
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
                attachments: opts?.attachments?.length
                  ? opts.attachments.map((f) => ({
                      name: f.name,
                      mediaType: f.media_type,
                    }))
                  : undefined,
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
            if (opts?.attachments?.length) {
              pendingAttachments.set(settled.userId, opts.attachments);
            }
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

        addContextLink: (nodeId, sourceNodeId) => {
          const chat = get().chats[get().activeChatId];
          const source = chat?.nodes[sourceNodeId];
          if (!source || nodeId === sourceNodeId) return;
          const label =
            source.branchLabel ??
            (source.content.length > 40
              ? `${source.content.slice(0, 40)}…`
              : source.content);
          patchActiveNode(
            nodeId,
            (node) =>
              (node.contextNodeIds ?? []).includes(sourceNodeId)
                ? null
                : {
                    contextNodeIds: [
                      ...(node.contextNodeIds ?? []),
                      sourceNodeId,
                    ],
                  },
            {
              type: "context-link",
              message: `Linked context from "${label}"`,
              nodeId,
            },
          );
        },

        removeContextLink: (nodeId, sourceNodeId) =>
          patchActiveNode(
            nodeId,
            (node) => {
              const links = (node.contextNodeIds ?? []).filter(
                (id) => id !== sourceNodeId,
              );
              if (links.length === (node.contextNodeIds ?? []).length) {
                return null;
              }
              return { contextNodeIds: links.length ? links : undefined };
            },
            { type: "context-link", message: "Removed a context link", nodeId },
          ),

        importChat: (text) => {
          // parseSession throws a user-facing Error on bad input; let it
          // propagate so the Toolbar can show the message.
          const sanitized = parseSession(text);
          const id = createChatId();
          const chat: ChatSessionState = {
            ...sanitized,
            id,
            activePath: computeActivePath(
              sanitized.nodes,
              sanitized.selectedNodeId,
            ),
          };
          set((state) => ({
            chats: { ...state.chats, [id]: chat },
            activeChatId: id,
          }));
          return id;
        },

        applySyncedChat: (chatId, payload, remoteUpdatedAt) => {
          const local = get().chats[chatId];
          if (local && local.updatedAt >= remoteUpdatedAt) return false;
          // Reuse the import path's validation/normalization (drops transient
          // and layout fields, prunes dangling refs); a malformed server blob
          // throws the same user-facing Error.
          const sanitized = parseSession(JSON.stringify(payload));
          const chat: ChatSessionState = {
            ...sanitized,
            id: chatId,
            // Keep the remote version stamp: sanitize sets updatedAt to "now",
            // which would make every pull look newer than the server and
            // immediately push back what we just pulled.
            updatedAt: remoteUpdatedAt,
            activePath: computeActivePath(
              sanitized.nodes,
              sanitized.selectedNodeId,
            ),
          };
          set((state) => ({ chats: { ...state.chats, [chatId]: chat } }));
          return true;
        },

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
