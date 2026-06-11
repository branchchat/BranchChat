// Backend chat client.
//
// The frontend is client-authoritative for the tree (see architecture.md):
// it posts a STATELESS completion payload and gets back reply text. Provider
// is selected by VITE_PROVIDER; base URL by VITE_API_BASE. Auth rides on the
// HTTP-only cookie, so requests are sent with credentials.

import type { ProviderMessage } from "@/store/chatStore";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const PROVIDER = import.meta.env.VITE_PROVIDER === "ollama" ? "ollama" : "gemini";

// Without a configured backend the app stays local-first and the store falls
// back to a stubbed reply. Set VITE_API_BASE to wire in the real provider.
export function isBackendConfigured(): boolean {
  return API_BASE.length > 0;
}

// One supplemental cross-branch context block (empty until context-linking
// lands in a later milestone; shape matches README "linked_context").
export interface LinkedContextBlock {
  source_node_id: string;
  source_label?: string;
  messages: ProviderMessage[];
}

// One file riding with the message being sent. `data` is raw base64 (no
// data: prefix). Backend caps: 3 per message, ~1.4 MB binary each.
export interface AttachmentPayload {
  name: string;
  media_type: string;
  data: string;
}

export interface ChatRequest {
  node_id: string;
  message: string;
  history: ProviderMessage[];
  linked_context: LinkedContextBlock[];
  coding_mode: boolean;
  // Attachments apply to THIS message only — they are not replayed with
  // history on later turns (and their bytes are never persisted locally).
  attachments?: AttachmentPayload[];
  personalization?: string;
  // Optional model override for model-specific branches. Absent = the
  // provider's server-side default (the original behaviour).
  model?: string;
}

interface ChatResponse {
  node_id?: string;
  reply?: string;
  provider?: string;
  model?: string;
}

// What the backend reports actually generated the reply (the model can differ
// from the request when the provider fell back internally).
export interface ChatReplyResult {
  reply: string;
  provider?: string;
  model?: string;
}

export class ChatApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
  }
}

// POST to /api/chat/{provider} and return the reply (plus which provider/
// model generated it). Throws ChatApiError on non-2xx (surfacing the
// backend's `detail`, e.g. a 429 quota message). `provider` defaults to the
// env-configured one, so callers without a branch override behave as before.
export async function requestChatReply(
  req: ChatRequest,
  opts?: { provider?: string; signal?: AbortSignal },
): Promise<ChatReplyResult> {
  const provider = opts?.provider ?? PROVIDER;
  const endpoint = `${API_BASE}/api/chat/${encodeURIComponent(provider)}`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(req),
      signal: opts?.signal,
    });
  } catch {
    throw new ChatApiError(
      "Could not reach the backend. Is it running and is VITE_API_BASE correct?",
      0,
    );
  }

  if (!res.ok) {
    let detail = `Request failed (HTTP ${res.status}).`;
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === "string" && data.detail) detail = data.detail;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ChatApiError(detail, res.status);
  }

  const data = (await res.json()) as ChatResponse;
  return {
    reply: data.reply ?? "",
    provider: data.provider,
    model: data.model,
  };
}

// ---------------------------------------------------------------------------
// model registry + recommendations (shapes from app/schemas/models.py)
// ---------------------------------------------------------------------------

export interface ModelInfo {
  provider: string;
  id: string;
  label: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
  context_window: number;
  multimodal: boolean;
  speed: "fast" | "medium" | "slow";
  cost_tier: "low" | "medium" | "high";
  badges: string[];
  is_default: boolean;
}

export interface ProviderStatus {
  name: string;
  configured: boolean;
}

export interface ModelsResponse {
  models: ModelInfo[];
  providers: ProviderStatus[];
}

export interface ModelRecommendation {
  provider: string;
  model: string;
  label: string;
  reason: string;
  score: number;
  badges: string[];
  task: string;
}

export interface RecommendRequest {
  message: string;
  context_sample?: string;
  context_chars?: number;
  coding_mode?: boolean;
  preference?: "quality" | "speed" | "cost";
}

// The model catalog changes rarely, so cache it for the session; the cache
// also backs the synchronous `modelLabel` lookup used by node badges.
let modelsCache: ModelsResponse | null = null;
let modelsCachePromise: Promise<ModelsResponse> | null = null;

// GET /api/models — available models + provider availability. Cached.
export function fetchAvailableModels(
  signal?: AbortSignal,
): Promise<ModelsResponse> {
  if (modelsCache) return Promise.resolve(modelsCache);
  if (modelsCachePromise) return modelsCachePromise;

  modelsCachePromise = (async () => {
    const res = await fetch(`${API_BASE}/api/models`, {
      credentials: "include",
      signal,
    });
    if (!res.ok) {
      throw new ChatApiError(
        `Request failed (HTTP ${res.status}).`,
        res.status,
      );
    }
    modelsCache = (await res.json()) as ModelsResponse;
    return modelsCache;
  })();
  // A failed fetch must not poison the cache; the next call retries.
  modelsCachePromise.catch(() => {
    modelsCachePromise = null;
  });
  return modelsCachePromise;
}

// Test seam: reset the module-level cache between tests.
export function clearModelsCache(): void {
  modelsCache = null;
  modelsCachePromise = null;
}

// Synchronous display-label lookup from the cache; falls back to the raw id
// before the catalog has loaded (or in stub mode).
export function modelLabel(
  provider: string | undefined,
  model: string | undefined,
): string | null {
  if (!model) return null;
  const hit = modelsCache?.models.find(
    (m) => m.id === model && (!provider || m.provider === provider),
  );
  return hit?.label ?? model;
}

// POST /api/models/recommend — backend-ranked models for the user's task.
// Never hardcode recommendations client-side; render what this returns.
export async function fetchModelRecommendations(
  req: RecommendRequest,
  signal?: AbortSignal,
): Promise<ModelRecommendation[]> {
  const res = await fetch(`${API_BASE}/api/models/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    throw new ChatApiError(`Request failed (HTTP ${res.status}).`, res.status);
  }
  const data = (await res.json()) as {
    recommendations?: ModelRecommendation[];
  };
  return data.recommendations ?? [];
}

// ---------------------------------------------------------------------------
// auth + usage (cookie-authenticated GETs; shapes from app/schemas/auth.py)
// ---------------------------------------------------------------------------

// Backend `UserOut`.
export interface AuthUser {
  id: string;
  email: string;
  email_verified: boolean;
  // Manually granted by an admin; gates the live chat (private beta).
  is_beta_tester: boolean;
  created_at: string;
}

// One quota counter (the backend's `UsageBucket`): coding mode has its own
// daily allowance separate from standard messages.
export interface UsageBucket {
  used: number;
  limit: number;
  remaining: number;
}

// Backend `UsageStatus`. `limit`/`used` are the backend's numbers — render
// them directly so quota copy always matches the server (todo "make quota UI
// copy match backend limits"). The top-level fields are the standard bucket;
// `coding` is the additive coding-mode bucket (backend `0a19026`). Typed
// optional so the meter degrades gracefully against an older backend.
export interface UsageStatus {
  authenticated: boolean;
  kind: string;
  used: number;
  limit: number;
  remaining: number;
  coding?: UsageBucket;
}

// GET /api/auth/me. Resolves null when not logged in — a 401 here is a normal
// state (anonymous user), not an error.
export async function fetchCurrentUser(
  signal?: AbortSignal,
): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    credentials: "include",
    signal,
  });
  if (res.status === 401) return null;
  if (!res.ok) {
    throw new ChatApiError(`Request failed (HTTP ${res.status}).`, res.status);
  }
  return (await res.json()) as AuthUser;
}

// GET /api/auth/usage — today's quota for the current identity (anon cookie
// or session cookie; the backend decides which).
export async function fetchUsage(signal?: AbortSignal): Promise<UsageStatus> {
  const res = await fetch(`${API_BASE}/api/auth/usage`, {
    credentials: "include",
    signal,
  });
  if (!res.ok) {
    throw new ChatApiError(`Request failed (HTTP ${res.status}).`, res.status);
  }
  return (await res.json()) as UsageStatus;
}

// POST JSON to an auth route. Non-2xx throws ChatApiError carrying the
// backend's `detail` — user-facing copy by contract (e.g. the uniform
// "Invalid email or password." 401, lockout 429s), so forms render it as-is.
async function postAuth<T>(path: string, body: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
  } catch {
    throw new ChatApiError(
      "Could not reach the backend. Is it running and is VITE_API_BASE correct?",
      0,
    );
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body; handled below.
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    throw new ChatApiError(
      typeof detail === "string" && detail
        ? detail
        : `Request failed (HTTP ${res.status}).`,
      res.status,
    );
  }
  return data as T;
}

// POST /api/auth/signup → 201 generic message. Deliberately does NOT log in
// (enumeration-safe); callers follow up with loginRequest.
export async function signupRequest(
  email: string,
  password: string,
): Promise<void> {
  await postAuth("/api/auth/signup", { email, password });
}

// POST /api/auth/login → UserOut + HttpOnly session cookie. Wrong credentials
// are a uniform 401 ChatApiError.
export async function loginRequest(
  email: string,
  password: string,
): Promise<AuthUser> {
  return postAuth<AuthUser>("/api/auth/login", { email, password });
}

// POST /api/auth/logout → clears the session cookie.
export async function logoutRequest(): Promise<void> {
  await postAuth("/api/auth/logout", {});
}

// All four below return the backend's `{detail}` message (MessageOut) on
// success; non-2xx throws ChatApiError with the detail (e.g. 400 invalid/used
// token).

// POST /api/auth/request-password-reset → always a generic 200 (enumeration-safe).
export async function requestPasswordReset(email: string): Promise<string> {
  const res = await postAuth<{ detail?: string }>(
    "/api/auth/request-password-reset",
    { email },
  );
  return res.detail ?? "If that email has an account, a reset link is on its way.";
}

// POST /api/auth/reset-password — token from the /reset-password URL + new password.
export async function resetPassword(
  token: string,
  password: string,
): Promise<string> {
  const res = await postAuth<{ detail?: string }>("/api/auth/reset-password", {
    token,
    password,
  });
  return res.detail ?? "Your password has been reset. You can now log in.";
}

// POST /api/auth/verify-email — token from the /verify-email URL.
export async function verifyEmail(token: string): Promise<string> {
  const res = await postAuth<{ detail?: string }>("/api/auth/verify-email", {
    token,
  });
  return res.detail ?? "Your email has been verified.";
}

// POST /api/auth/resend-verification (requires the session cookie).
export async function resendVerification(): Promise<string> {
  const res = await postAuth<{ detail?: string }>(
    "/api/auth/resend-verification",
    {},
  );
  return res.detail ?? "Verification email sent.";
}

// --- in-app feedback --------------------------------------------------------
// Stored server-side (cookie auth) so notes always reach us, regardless of the
// tester's analytics choice. The widget lives behind the account gate.

export interface FeedbackPayload {
  category: "bug" | "idea" | "other";
  message: string;
  path?: string;
  chat_title?: string;
}

// POST /api/feedback — throws ChatApiError on failure (surfacing the detail).
export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  await postAuth<{ detail?: string }>("/api/feedback", payload);
}

// --- server-side sync (optional, signed-in users) ---------------------------
// The app stays local-first; /api/sync is a per-chat backup/sync target.
// Payloads are the same versioned envelope as session export/import; conflict
// resolution is last-write-wins on the chat's updatedAt (see lib/sync.ts).

export interface SyncManifestEntry {
  chat_id: string;
  title: string | null;
  updated_at: number;
  // True = a delete tombstone: drop the local copy unless it's strictly
  // newer (in which case pushing it resurrects the chat).
  deleted?: boolean;
}

export interface SyncedChatPayload {
  chat_id: string;
  title: string | null;
  updated_at: number;
  payload: Record<string, unknown>;
}

// JSON request with cookie credentials; non-2xx throws ChatApiError with the
// backend's `detail` (same contract as postAuth, but method-generic).
async function syncFetch<T>(
  path: string,
  init?: { method?: string; body?: object },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      credentials: "include",
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ChatApiError("Could not reach the backend.", 0);
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body; handled below.
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    throw new ChatApiError(
      typeof detail === "string" && detail
        ? detail
        : `Request failed (HTTP ${res.status}).`,
      res.status,
    );
  }
  return data as T;
}

// GET /api/sync/chats → ids + versions of everything synced for this user.
export async function fetchSyncManifest(): Promise<SyncManifestEntry[]> {
  const res = await syncFetch<{ chats: SyncManifestEntry[] }>("/api/sync/chats");
  return res.chats;
}

// GET /api/sync/chats/{id} → one synced chat (the full payload envelope).
export function fetchSyncedChat(chatId: string): Promise<SyncedChatPayload> {
  return syncFetch(`/api/sync/chats/${encodeURIComponent(chatId)}`);
}

// PUT /api/sync/chats/{id} → "stored"; "stale" when the server copy is newer
// (the caller should pull instead); "deleted" when the chat is tombstoned and
// this push wasn't strictly newer (the caller should drop its local copy).
export function pushSyncedChat(
  chatId: string,
  payload: Record<string, unknown>,
  updatedAt: number,
  title?: string,
): Promise<{ status: "stored" | "stale" | "deleted"; updated_at: number }> {
  return syncFetch(`/api/sync/chats/${encodeURIComponent(chatId)}`, {
    method: "PUT",
    body: { payload, updated_at: updatedAt, title: title ?? null },
  });
}

// DELETE /api/sync/chats/{id} → tombstone the server copy (local untouched).
// The tombstone is what stops a stale offline device re-pushing the chat.
export function deleteSyncedChat(chatId: string): Promise<void> {
  return syncFetch(`/api/sync/chats/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
  });
}
