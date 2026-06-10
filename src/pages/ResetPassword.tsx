// /reset-password?token=… — the page the password-reset email links to.
// Reads the token from the URL, takes a new password, and POSTs both. On
// success the user is told to sign in; an invalid/expired token surfaces the
// backend's 400 detail.

import { useState } from "react";
import { Link } from "react-router-dom";

import { AuthPage } from "@/pages/AuthPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatApiError, resetPassword } from "@/lib/api";
import { readAuthTokenFromUrl } from "@/lib/authToken";

export function ResetPassword() {
  // Reads the token AND strips it from the address bar — a live reset token
  // must not sit in history/analytics while the user types a new password.
  const token = readAuthTokenFromUrl();

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await resetPassword(token, password));
    } catch (err) {
      setError(
        err instanceof ChatApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthPage title="Reset password">
        <p className="text-muted-foreground">
          This reset link is missing its token. Request a new one from the sign-in
          screen.
        </p>
      </AuthPage>
    );
  }

  if (done) {
    return (
      <AuthPage title="Password reset">
        <p className="text-muted-foreground">{done}</p>
        <Button asChild className="mt-4 w-full">
          <Link to="/app">Continue to sign in</Link>
        </Button>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Choose a new password">
      <form onSubmit={(e) => void submit(e)} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">At least 12 characters.</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy}>
          {busy ? "Resetting…" : "Reset password"}
        </Button>
      </form>
    </AuthPage>
  );
}
