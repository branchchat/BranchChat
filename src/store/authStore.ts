// authStore — auth user + daily usage quota (architecture.md "Frontend Source
// Of Truth": auth and quota state live here, conversation state in chatStore).
//
// Nothing is persisted: the HttpOnly session/anon cookies are the source of
// truth, so state is re-derived from `/api/auth/me` + `/api/auth/usage` on
// every load. `hydrate()` runs once on mount (UsageMeter's effect);
// `refreshUsage()` re-fetches after each backend chat round-trip, since a
// reply consumes quota and a 429 means the meter is stale.
//
// Without a configured backend (local-first stub mode) both actions no-op and
// the store stays empty — there is no quota to meter.

import { create } from "zustand";

import {
  fetchCurrentUser,
  fetchUsage,
  isBackendConfigured,
  type AuthUser,
  type UsageStatus,
} from "@/lib/api";

export interface AuthStoreState {
  user: AuthUser | null;
  usage: UsageStatus | null;
  // True once hydrate() has settled (used to tell "anonymous" from "unknown").
  hydrated: boolean;

  hydrate: () => Promise<void>;
  refreshUsage: () => Promise<void>;
}

let hydrating = false;

export const useAuthStore = create<AuthStoreState>()((set) => ({
  user: null,
  usage: null,
  hydrated: false,

  hydrate: async () => {
    if (!isBackendConfigured() || hydrating) return;
    hydrating = true;
    try {
      // Both are independent GETs; a failure of one (e.g. backend briefly
      // unreachable) shouldn't blank the other.
      const [user, usage] = await Promise.all([
        fetchCurrentUser().catch(() => null),
        fetchUsage().catch(() => null),
      ]);
      set({ user, usage, hydrated: true });
    } finally {
      hydrating = false;
    }
  },

  refreshUsage: async () => {
    if (!isBackendConfigured()) return;
    try {
      set({ usage: await fetchUsage() });
    } catch {
      // Keep the last known value; the next round-trip refreshes again.
    }
  },
}));
