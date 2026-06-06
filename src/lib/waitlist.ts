// Waitlist signup client. Posts to the backend (VITE_API_BASE) /api/waitlist.
// Kept separate from chatStore's api.ts so the chat client stays untouched.

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function joinWaitlist(
  email: string,
  source = "landing",
): Promise<void> {
  if (!API_BASE) {
    // Local-first: no backend configured → simulate a successful signup.
    await new Promise((r) => setTimeout(r, 600));
    return;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Please try again.");
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
