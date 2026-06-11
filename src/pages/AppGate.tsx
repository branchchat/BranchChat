// Account-gated /app — replaces the shared dev passphrase.
//
// The passphrase only hid the UI (and could leak); access is now a per-account
// beta flag enforced SERVER-SIDE on the chat endpoints, so this gate is pure
// UX. Three states: signed out → sign in / create account; signed in but
// unapproved → "pending approval"; approved → the app.
//
// With no backend configured (local dev, e2e) the gate steps aside: replies
// are stubbed there, so there are no tokens to protect.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clock, LogOut, RefreshCw } from "lucide-react";

import { AppChat } from "@/components/AppChat";
import { AuthDialog } from "@/components/AuthDialog";
import { Brand } from "@/components/landing/Brand";
import { Button } from "@/components/ui/button";
import { isBackendConfigured } from "@/lib/api";
import { usePageMeta } from "@/lib/usePageMeta";
import { useAuthStore } from "@/store/authStore";

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6">
      <div className="bc-rise w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Brand />
          {children}
        </div>
        <Link
          to="/"
          className="mt-6 block text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

export function AppGate() {
  // Distinct title so the gated app doesn't inherit the marketing homepage
  // title (the /app route is Disallow'ed in robots.txt — no description needed).
  usePageMeta("BranchChat App");

  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const logout = useAuthStore((s) => s.logout);
  // Deep link from /beta or the landing footer: /app?auth=signup|signin
  // opens the auth dialog on that form immediately (captured once at mount,
  // so closing the dialog doesn't reopen it).
  const [searchParams] = useSearchParams();
  const [authMode] = useState<"signin" | "signup">(() =>
    searchParams.get("auth") === "signup" ? "signup" : "signin",
  );
  const [authOpen, setAuthOpen] = useState(
    () => searchParams.get("auth") === "signup" || searchParams.get("auth") === "signin",
  );
  const [checking, setChecking] = useState(false);

  // Resolve the session before deciding which gate state to show.
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  if (!isBackendConfigured()) return <AppChat />;

  if (!hydrated) {
    return (
      <GateShell>
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      </GateShell>
    );
  }

  if (!user) {
    return (
      <GateShell>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">
          Private beta
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          BranchChat is in a closed beta. Sign in, or create an account to
          request access — we approve testers in waves.
        </p>
        <Button className="mt-6 w-full" onClick={() => setAuthOpen(true)}>
          Sign in or create account
        </Button>
        <AuthDialog
          open={authOpen}
          onOpenChange={setAuthOpen}
          initialMode={authMode}
        />
      </GateShell>
    );
  }

  if (!user.is_beta_tester) {
    const recheck = async () => {
      setChecking(true);
      try {
        await hydrate();
      } finally {
        setChecking(false);
      }
    };
    return (
      <GateShell>
        <span className="mt-6 flex size-10 items-center justify-center rounded-full border bg-secondary/50">
          <Clock className="size-4.5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          You're on the list
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account ({user.email}) is awaiting beta approval. We approve
          testers in waves and will email you the moment you're in.
        </p>
        <div className="mt-6 flex w-full gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => void recheck()}
            disabled={checking}
          >
            <RefreshCw className={checking ? "size-3.5 animate-spin" : "size-3.5"} />
            Check again
          </Button>
          <Button
            variant="ghost"
            className="flex-1 gap-2 text-muted-foreground"
            onClick={() => void logout()}
          >
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>
      </GateShell>
    );
  }

  return <AppChat />;
}
