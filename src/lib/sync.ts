// Server-side sync engine (always on for signed-in users).
//
// The app stays local-first: localStorage is the working copy; the backend's
// /api/sync is a per-chat backup/sync target that runs automatically whenever
// a signed-in user has a configured backend — there is deliberately no off
// switch, so nobody loses chats to a toggle they forgot. Each chat syncs as
// the session-export envelope, keyed by its local chat id, with
// last-write-wins on the chat's own updatedAt:
//
//   pull: server copy newer (or missing locally)  → applySyncedChat
//   push: local copy newer (or missing on server) → PUT
//
// Deletes are honored end to end. Deleting a chat records a LOCAL tombstone
// (lib/syncTombstones); this engine then tombstones the SERVER copy, and the
// server's manifest broadcasts the deletion so every other device drops its
// local copy too. A stale offline device re-pushing gets "deleted" back and
// drops its copy; only a strictly NEWER version (real edits made elsewhere)
// resurrects the chat — in which case the deleting device retires its
// tombstone and pulls it back, instead of ping-ponging deletes. A wiped
// browser has no tombstones, so restore-on-pull still works. Errors are
// swallowed into the status so an offline backend never breaks the app.

import {
  deleteSyncedChat,
  fetchSyncManifest,
  fetchSyncedChat,
  isBackendConfigured,
  pushSyncedChat,
} from "@/lib/api";
import { EXPORT_VERSION, type SessionExport } from "@/lib/sessionTransfer";
import { getTombstones, removeTombstone } from "@/lib/syncTombstones";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import type { ChatSessionState } from "@/types/chat";

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

// Subscribe to status changes (returns unsubscribe) — used by the status row.
export function onSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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

// One full two-way pass. Safe to call any time: no-ops unless signed in with
// a backend configured; concurrent calls collapse into one.
export async function syncNow(): Promise<void> {
  if (!isBackendConfigured()) return;
  if (!useAuthStore.getState().user) return;
  if (syncing) return;
  syncing = true;
  setStatus({ ...status, state: "syncing" });
  try {
    const manifest = await fetchSyncManifest();
    const tombstones = getTombstones();
    const store = useChatStore.getState();

    // The version map the push pass compares against. Tombstoned server
    // entries stay in it: a local copy strictly newer than the deleted
    // version SHOULD push (that's the legitimate resurrect path).
    const remote = new Map(manifest.map((m) => [m.chat_id, m.updated_at]));

    // 1. Our deletes → the server. For every locally-tombstoned id the server
    // still considers alive: if the server version is strictly newer than
    // what we deleted, another device resurrected it with real edits — honor
    // that and retire our tombstone (the pull below brings it back).
    // Otherwise tombstone the server copy. Best-effort: a failed call just
    // retries next pass.
    for (const [id, tomb] of Object.entries(tombstones)) {
      const entry = manifest.find((m) => m.chat_id === id);
      if (!entry || entry.deleted) continue; // unknown or already tombstoned
      if (entry.updated_at > tomb.v) {
        removeTombstone(id);
        delete tombstones[id];
      } else {
        try {
          await deleteSyncedChat(id);
        } catch {
          // Leave it; the local tombstone retries next pass.
        }
        remote.delete(id);
      }
    }

    // 2. Server deletes → us. A tombstoned manifest entry means some device
    // deliberately deleted this chat: drop our copy unless ours is strictly
    // newer (then the push pass resurrects it instead).
    for (const m of manifest) {
      if (!m.deleted) continue;
      const local = store.chats[m.chat_id];
      if (local && local.updatedAt <= m.updated_at) {
        // deleteChat also writes a local tombstone — harmless here, and it
        // keeps the id from being re-pushed before this pass finishes.
        useChatStore.getState().deleteChat(m.chat_id);
      }
    }

    // 3. Pull everything the server has newer (or that we don't have at all)
    // — skipping tombstones in either direction.
    for (const m of manifest) {
      if (m.deleted || tombstones[m.chat_id]) continue;
      const local = useChatStore.getState().chats[m.chat_id];
      if (!local || local.updatedAt < m.updated_at) {
        const synced = await fetchSyncedChat(m.chat_id);
        try {
          useChatStore
            .getState()
            .applySyncedChat(m.chat_id, synced.payload, synced.updated_at);
        } catch {
          // A malformed server blob shouldn't kill the rest of the pass.
        }
      }
    }

    // 4. Push everything local that's newer (or that the server doesn't
    // have). Re-read state: the passes above may have changed it.
    const current = useChatStore.getState().chats;
    for (const chat of Object.values(current)) {
      if (tombstones[chat.id]) continue;
      const remoteVersion = remote.get(chat.id);
      if (remoteVersion === undefined || chat.updatedAt > remoteVersion) {
        const res = await pushSyncedChat(
          chat.id,
          envelope(chat),
          chat.updatedAt,
          chat.title,
        );
        if (res.status === "deleted") {
          // Raced a delete from another device and lost: drop our copy too.
          useChatStore.getState().deleteChat(chat.id);
        }
        // "stale": raced a newer write; pick it up next pass.
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
    if (!useAuthStore.getState().user) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
  });

  // First pass when a signed-in session appears (login or hydrate).
  useAuthStore.subscribe((state, prev) => {
    if (state.user && !prev.user) void syncNow();
  });
}
