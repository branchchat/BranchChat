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

export interface ChatRequest {
  node_id: string;
  message: string;
  history: ProviderMessage[];
  linked_context: LinkedContextBlock[];
  coding_mode: boolean;
  personalization?: string;
}

interface ChatResponse {
  node_id?: string;
  reply?: string;
}

export class ChatApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
  }
}

// POST to /api/chat/{provider} and return the reply text. Throws ChatApiError
// on non-2xx (surfacing the backend's `detail`, e.g. a 429 quota message).
export async function requestChatReply(
  req: ChatRequest,
  signal?: AbortSignal,
): Promise<string> {
  const endpoint = `${API_BASE}/api/chat/${PROVIDER}`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(req),
      signal,
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
  return data.reply ?? "";
}

// ---------------------------------------------------------------------------
// auth + usage (cookie-authenticated GETs; shapes from app/schemas/auth.py)
// ---------------------------------------------------------------------------

// Backend `UserOut`.
export interface AuthUser {
  id: string;
  email: string;
  email_verified: boolean;
  created_at: string;
}

// Backend `UsageStatus`. `limit`/`used` are the backend's numbers — render
// them directly so quota copy always matches the server (todo "make quota UI
// copy match backend limits").
export interface UsageStatus {
  authenticated: boolean;
  kind: string;
  used: number;
  limit: number;
  remaining: number;
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
