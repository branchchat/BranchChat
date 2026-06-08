// /verify-email?token=… — the page the verification email links to. POSTs the
// token once on mount and reports the outcome. On success it refreshes the
// auth store so a logged-in user's verified state updates immediately.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AuthPage } from "@/pages/AuthPage";
import { Button } from "@/components/ui/button";
import { ChatApiError, verifyEmail } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

type Status =
  | { kind: "verifying" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

// Tokens are single-use, so each must be POSTed exactly once. A module-level
// guard survives React StrictMode's mount/unmount/remount (an instance ref
// would reset on the remount and consume the token twice → spurious 400).
const attempted = new Set<string>();

export function VerifyEmail() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const hydrate = useAuthStore((s) => s.hydrate);
  // Derive the no-token error during render (avoids a synchronous setState in
  // the effect); the network result is set asynchronously below.
  const [status, setStatus] = useState<Status>(
    token
      ? { kind: "verifying" }
      : { kind: "error", message: "This verification link is missing its token." },
  );
  useEffect(() => {
    if (!token || attempted.has(token)) return;
    attempted.add(token);

    verifyEmail(token)
      .then((message) => {
        setStatus({ kind: "ok", message });
        // Reflect the new verified state if the user is signed in.
        void hydrate();
      })
      .catch((err) => {
        setStatus({
          kind: "error",
          message:
            err instanceof ChatApiError
              ? err.message
              : "Something went wrong verifying your email.",
        });
      });
  }, [token, hydrate]);

  return (
    <AuthPage title="Verify email">
      {status.kind === "verifying" && (
        <p className="text-muted-foreground">Verifying your email…</p>
      )}
      {status.kind === "ok" && (
        <>
          <p className="text-muted-foreground">{status.message}</p>
          <Button asChild className="mt-4 w-full">
            <Link to="/app">Continue to the app</Link>
          </Button>
        </>
      )}
      {status.kind === "error" && (
        <>
          <p role="alert" className="text-sm text-destructive">
            {status.message}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Signed in? You can request a fresh link from the app.
          </p>
        </>
      )}
    </AuthPage>
  );
}
