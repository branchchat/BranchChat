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
