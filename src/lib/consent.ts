// Cookie/analytics consent state.
//
// PostHog is initialized with `opt_out_capturing_by_default: true` (see
// main.tsx), so nothing is captured or recorded until the user accepts here.
// We persist the explicit choice and let any component re-open the banner so
// consent can be withdrawn at any time (GDPR/ePrivacy).
const STORAGE_KEY = "branchchat_cookie_consent";
const OPEN_EVENT = "branchchat:open-cookie-settings";

export type ConsentChoice = "accepted" | "declined";

export function getConsent(): ConsentChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "accepted" || v === "declined" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* storage unavailable (private mode, etc.) — ignore */
  }
}

/** Re-open the cookie banner from anywhere (e.g. a footer "Cookie settings" link). */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export const COOKIE_SETTINGS_EVENT = OPEN_EVENT;
