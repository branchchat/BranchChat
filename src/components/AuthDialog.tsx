// Sign-in / create-account dialog, wired to authStore.
//
// Deliberately router-free (modal, not a page) so it doesn't collide with the
// react-router restructure arriving with roshaan/landing. Error copy comes
// straight from the backend's `detail` (uniform 401, lockout 429, etc. —
// user-facing by contract). "Forgot password" follows in the token-routes PR:
// the reset email links to /reset-password, which doesn't exist yet.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

type Mode = "signin" | "signup";

const COPY: Record<
  Mode,
  { title: string; description: string; submit: string; busy: string }
> = {
  signin: {
    title: "Sign in",
    description: "Welcome back. Your chats stay in this browser either way.",
    submit: "Sign in",
    busy: "Signing in…",
  },
  signup: {
    title: "Create account",
    description: "Get a higher daily message limit and email recovery.",
    submit: "Create account",
    busy: "Creating account…",
  },
};

export function AuthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = COPY[mode];

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setError(null);
      setPassword("");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await (mode === "signin" ? login : signup)(email.trim(), password);
      close(false);
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

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              required
              // Display-only fast-fail; the backend enforces its own policy
              // and its 422/detail would render below anyway.
              minLength={mode === "signup" ? 12 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" && (
              <p className="text-xs text-muted-foreground">
                At least 12 characters.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? copy.busy : copy.submit}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => switchMode("signup")}
              >
                Create account
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
