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
  loginRequest,
  logoutRequest,
  signupRequest,
  type AuthUser,
  type UsageStatus,
} from "@/lib/api";

export interface AuthStoreState {
  user: AuthUser | null;
  usage: UsageStatus | null;
  // True once hydrate() has settled (used to tell "anonymous" from "unknown").
  hydrated: boolean;
  // True when the signed-in session stopped authenticating (cookie expired)
  // — AppChat pops the sign-in dialog over the canvas. The stale `user` is
  // kept so the gate doesn't unmount the app mid-work.
  sessionExpired: boolean;

  hydrate: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  // Called after an auth-shaped failure (401/403) anywhere: re-verifies the
  // session against /me and raises sessionExpired if it's gone.
  checkSessionExpiry: () => Promise<void>;
  clearSessionExpired: () => void;

  // The three actions below throw ChatApiError with the backend's user-facing
  // `detail` on failure — forms render err.message directly.
  login: (email: string, password: string) => Promise<void>;
  // Signup chains into login: the backend's 201 deliberately does NOT set a
  // session cookie (enumeration-safe), so we log in right after.
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

let hydrating = false;

export const useAuthStore = create<AuthStoreState>()((set, get) => ({
  user: null,
  usage: null,
  hydrated: false,
  sessionExpired: false,

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

  checkSessionExpiry: async () => {
    // Only meaningful when the UI believes someone is signed in.
    if (!isBackendConfigured() || !get().user || get().sessionExpired) return;
    const fresh = await fetchCurrentUser().catch(() => null);
    if (!fresh) {
      set({ sessionExpired: true });
    }
  },

  clearSessionExpired: () => set({ sessionExpired: false }),

  login: async (email, password) => {
    const user = await loginRequest(email, password);
    // Fetch the new identity's quota BEFORE surfacing the user, then commit
    // both in one set() — otherwise the header would show the email next to
    // the stale anon limit for a frame until usage caught up.
    const usage = await fetchUsage().catch(() => null);
    // A successful login also resolves any session-expired prompt.
    set((s) => ({
      user,
      usage: usage ?? s.usage,
      hydrated: true,
      sessionExpired: false,
    }));
  },

  signup: async (email, password) => {
    await signupRequest(email, password);
    await get().login(email, password);
  },

  logout: async () => {
    await logoutRequest();
    // Same single-commit pattern: drop the user and the anon quota together.
    // A deliberate sign-out is not an expired session.
    const usage = await fetchUsage().catch(() => null);
    set((s) => ({ user: null, usage: usage ?? s.usage, sessionExpired: false }));
  },
}));
