// Thin banner shown in the app when the signed-in user hasn't verified their
// email yet. Lets them re-send the verification link (POST resend-verification,
// cookie-authed). Renders nothing for anonymous or already-verified users.

import { useState } from "react";

import { ChatApiError, resendVerification } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export function VerifyEmailBanner() {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || user.email_verified) return null;

  const resend = async () => {
    setBusy(true);
    try {
      setStatus(await resendVerification());
    } catch (err) {
      setStatus(
        err instanceof ChatApiError
          ? err.message
          : "Couldn't send the email. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-b bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
      <span>Verify your email to secure your account.</span>
      {status ? (
        <span className="font-medium text-foreground">{status}</span>
      ) : (
        <button
          type="button"
          disabled={busy}
          className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
          onClick={() => void resend()}
        >
          {busy ? "Sending…" : "Resend verification email"}
        </button>
      )}
    </div>
  );
}
