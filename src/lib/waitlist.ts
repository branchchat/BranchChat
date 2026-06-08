// Waitlist signup client. Posts to the backend (VITE_API_BASE) /api/waitlist.
// Kept separate from chatStore's api.ts so the chat client stays untouched.

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// Abort a stalled signup after this long so the form fails fast and the user can
// retry, instead of hanging on "Joining…" forever. Flaky mobile / in-app browser
// connections were silently dropping signups (request never reached the backend).
const WAITLIST_TIMEOUT_MS = 8000;

export async function joinWaitlist(
  email: string,
  source = "landing",
): Promise<void> {
  if (!API_BASE) {
    // Local-first: no backend configured → simulate a successful signup.
    await new Promise((r) => setTimeout(r, 600));
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WAITLIST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source }),
      signal: controller.signal,
    });
  } catch {
    // Timeout (AbortError) or network failure both land here.
    throw new Error("Couldn't reach the server. Please try again.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === "string" && data.detail) detail = data.detail;
    } catch {
      /* keep generic */
    }
    throw new Error(detail);
  }
}
