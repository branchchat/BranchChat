// Sync tombstones — remembering chats the user DELIBERATELY deleted.
//
// Sync is restore-on-pull: anything on the server that's missing locally gets
// re-downloaded. That's what makes a wiped browser recover its chats — but it
// also means a deliberate delete just comes back on the next pass, because the
// engine can't tell "I deleted this" apart from "I never had it."
//
// A tombstone records the intent. On delete we mark the id here; the sync
// engine then deletes the server copy and refuses to re-pull that id. A wiped
// browser has no tombstones, so restore still works.
//
// Stored in its own localStorage key (not the chat store) as { id: deletedAt }.
// Entries are pruned after TTL_MS so the set can't grow forever — by then the
// server copy is long gone, so there's nothing left to resurrect.

const KEY = "branchchat-sync-tombstones";
// Generous: only bounds storage. The server copy is removed on the first sync
// pass after a delete, so the tombstone has done its job well before this.
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

function read(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const cutoff = Date.now() - TTL_MS;
    const out: Record<string, number> = {};
    for (const [id, ts] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ts === "number" && ts >= cutoff) out[id] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

function write(map: Record<string, number>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable — deletes just won't be remembered across reloads.
  }
}

// Record a deliberate delete. Uses a fixed timestamp source via Date.now();
// tombstones are local-only metadata so this never crosses the sync boundary.
export function addTombstone(chatId: string): void {
  const map = read();
  map[chatId] = Date.now();
  write(map);
}

export function getTombstones(): Record<string, number> {
  const map = read();
  // Re-persist the pruned view so expired entries don't linger.
  write(map);
  return map;
}

export function isTombstoned(chatId: string): boolean {
  return chatId in read();
}
