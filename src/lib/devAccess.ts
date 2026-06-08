// Dev gate for the live chat at /app.
//
// NOTE: this is a soft, client-side gate so waitlist visitors don't wander into
// the in-progress chat — NOT real security (the passphrase ships in the bundle).
// Backend quotas/auth are the real protection. Change DEV_PASSPHRASE as needed.

const STORAGE_KEY = "bc_dev_access";
const DEV_PASSPHRASE = "letmebranch";

export function hasDevAccess(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function grant(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    /* ignore */
  }
}

export function tryPassphrase(input: string): boolean {
  if (input.trim().toLowerCase() === DEV_PASSPHRASE) {
    grant();
    return true;
  }
  return false;
}

// Allow unlocking via /app?key=<passphrase> for quick sharing with the team.
export function checkUrlKey(): boolean {
  try {
    const key = new URLSearchParams(window.location.search).get("key");
    if (key && key.trim().toLowerCase() === DEV_PASSPHRASE) {
      grant();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
