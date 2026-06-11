// Server-side sync engine (optional, signed-in users only).
//
// The app stays local-first: localStorage is the working copy; the backend's
// /api/sync is a per-chat backup/sync target the user opts into (the toggle in
// the Toolbar footer persists to its own localStorage key, NOT the chat
// store). Each chat syncs as the session-export envelope, keyed by its local
// chat id, with last-write-wins on the chat's own updatedAt:
//
//   pull: server copy newer (or missing locally)  → applySyncedChat
//   push: local copy newer (or missing on server) → PUT
//
// Deleting a chat locally does NOT delete the server copy (a wiped browser
// must not erase the backup — restore happens on the next pull). Errors are
// swallowed into the status so an offline backend never breaks the app.

import {
  fetchSyncManifest,
  fetchSyncedChat,
  isBackendConfigured,
  pushSyncedChat,
} from "@/lib/api";
import { EXPORT_VERSION, type SessionExport } from "@/lib/sessionTransfer";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import type { ChatSessionState } from "@/types/chat";

const ENABLED_KEY = "branchchat-sync-enabled";
const DEBOUNCE_MS = 3_000;

export type SyncState = "idle" | "syncing" | "synced" | "error";

export interface SyncStatus {
  state: SyncState;
  // User-facing message for the error state.
  message?: string;
  lastSyncedAt?: number;
}

type Listener = (status: SyncStatus) => void;

let status: SyncStatus = { state: "idle" };
const listeners = new Set<Listener>();

function setStatus(next: SyncStatus): void {
  status = next;
  for (const l of listeners) l(status);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

// Subscribe to status changes (returns unsubscribe) — used by the toggle UI.
export function onSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isSyncEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSyncEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // Storage unavailable — the toggle just won't persist.
  }
  if (enabled) {
    void syncNow();
  } else {
    setStatus({ state: "idle" });
  }
}

function envelope(chat: ChatSessionState): Record<string, unknown> {
  const env: SessionExport = {
    type: "branchchat-session",
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    chat,
  };
  return env as unknown as Record<string, unknown>;
}

let syncing = false;

// One full two-way pass. Safe to call any time: no-ops unless enabled, signed
// in, and a backend is configured; concurrent calls collapse into one.
export async function syncNow(): Promise<void> {
  if (!isSyncEnabled() || !isBackendConfigured()) return;
  if (!useAuthStore.getState().user) return;
  if (syncing) return;
  syncing = true;
  setStatus({ ...status, state: "syncing" });
  try {
    const manifest = await fetchSyncManifest();
    const remote = new Map(manifest.map((m) => [m.chat_id, m.updated_at]));
    const { chats, applySyncedChat } = useChatStore.getState();

    // Pull everything the server has newer (or that we don't have at all).
    for (const m of manifest) {
      const local = chats[m.chat_id];
      if (!local || local.updatedAt < m.updated_at) {
        const synced = await fetchSyncedChat(m.chat_id);
        try {
          applySyncedChat(m.chat_id, synced.payload, synced.updated_at);
        } catch {
          // A malformed server blob shouldn't kill the rest of the pass.
        }
      }
    }

    // Push everything local that's newer (or that the server doesn't have).
    // Re-read state: pulls above may have replaced chats.
    const current = useChatStore.getState().chats;
    for (const chat of Object.values(current)) {
      const remoteVersion = remote.get(chat.id);
      if (remoteVersion === undefined || chat.updatedAt > remoteVersion) {
        const res = await pushSyncedChat(
          chat.id,
          envelope(chat),
          chat.updatedAt,
          chat.title,
        );
        if (res.status === "stale") {
          // Raced a newer write from another device; pick it up next pass.
          continue;
        }
      }
    }

    setStatus({ state: "synced", lastSyncedAt: Date.now() });
  } catch (err) {
    setStatus({
      state: "error",
      message: err instanceof Error ? err.message : "Sync failed.",
      lastSyncedAt: status.lastSyncedAt,
    });
  } finally {
    syncing = false;
  }
}

let started = false;

// Wire the debounced background loop: any chat-store change schedules a pass.
// Called once from the app shell; subsequent calls no-op.
export function startSyncLoop(): void {
  if (started) return;
  started = true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  useChatStore.subscribe((state, prev) => {
    if (state.chats === prev.chats) return; // transient/UI-only change
    if (!isSyncEnabled() || !useAuthStore.getState().user) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
  });

  // First pass when a signed-in session appears (login or hydrate).
  useAuthStore.subscribe((state, prev) => {
    if (state.user && !prev.user) void syncNow();
  });
}
