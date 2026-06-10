// Single-use auth tokens (?token=…) arrive on the email-link pages
// (/verify-email, /reset-password). Reading one through this helper strips it
// from the address bar immediately, so the secret doesn't linger in browser
// history, ride into analytics pageviews/replays, or leak via copy-pasted
// URLs. (main.tsx additionally scrubs token params from PostHog events, since
// the initial pageview fires before React mounts.)
//
// A module-level cache keyed by pathname keeps re-renders — and StrictMode's
// unmount/remount — stable after the URL has been cleaned.

const cache = new Map<string, string>();

export function readAuthTokenFromUrl(): string {
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return "";
  }
  const key = url.pathname;
  const fromUrl = url.searchParams.get("token");
  if (fromUrl) {
    cache.set(key, fromUrl);
    url.searchParams.delete("token");
    try {
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // History unavailable (sandboxed context) — better to leave the token
      // visible than to break the verify/reset flow.
    }
  }
  return fromUrl ?? cache.get(key) ?? "";
}
