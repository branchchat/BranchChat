// Local sync tombstones — remembering chats the user DELIBERATELY deleted.
//
// Sync is restore-on-pull, so the engine can't tell "I deleted this" apart
// from "I never had it." A tombstone records the intent: on delete we mark
// the id here; the engine then tombstones the server copy and refuses to
// re-pull that id. A wiped browser has no tombstones, so restore still works.
//
// Each entry records the chat's updatedAt at deletion (`v`). That's what lets
// a RESURRECTED chat come back: if another device pushed a strictly newer
// version after our delete, the manifest shows the id alive with
// updated_at > v, and the engine drops the tombstone instead of re-deleting —
// without it, two devices would ping-pong delete/restore forever.
//
// Stored in its own localStorage key (not the chat store) as
// { id: { ts: deletedAtMs, v: chatUpdatedAtMs } }. Entries are pruned after
// TTL_MS so the set can't grow forever — the server tombstone (backend
// migration 0010) is the durable record by then.

const KEY = "branchchat-sync-tombstones";
// Generous: only bounds storage. The server learns about the delete on the
// first sync pass, so the local tombstone has done its job well before this.
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

export interface Tombstone {
  // When the user deleted the chat (wall clock, for TTL pruning).
  ts: number;
  // The chat's updatedAt at deletion — the version the delete superseded.
  v: number;
}

function read(): Record<string, Tombstone> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const cutoff = Date.now() - TTL_MS;
    const out: Record<string, Tombstone> = {};
    for (const [id, val] of Object.entries(parsed as Record<string, unknown>)) {
      // Legacy shape (id → deletedAt number): treat the deletion time as the
      // version too — updatedAt is also Date.now()-based, so anything pushed
      // after the delete still counts as strictly newer.
      const entry =
        typeof val === "number"
          ? { ts: val, v: val }
          : (val as Partial<Tombstone>);
      if (
        typeof entry?.ts === "number" &&
        typeof entry?.v === "number" &&
        entry.ts >= cutoff
      ) {
        out[id] = { ts: entry.ts, v: entry.v };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function write(map: Record<string, Tombstone>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable — deletes just won't be remembered across reloads
    // (the server tombstone still protects against resurrection).
  }
}

// Record a deliberate delete of a chat whose content version was `version`.
export function addTombstone(chatId: string, version: number): void {
  const map = read();
  map[chatId] = { ts: Date.now(), v: version };
  write(map);
}

// Forget a tombstone — used when another device legitimately resurrected the
// chat with newer content.
export function removeTombstone(chatId: string): void {
  const map = read();
  if (chatId in map) {
    delete map[chatId];
    write(map);
  }
}

export function getTombstones(): Record<string, Tombstone> {
  const map = read();
  // Re-persist the pruned view so expired entries don't linger.
  write(map);
  return map;
}

export function isTombstoned(chatId: string): boolean {
  return chatId in read();
}
