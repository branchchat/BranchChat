// Header auth entry point: "Sign in" (opens AuthDialog) when anonymous,
// "Sign out" when authenticated. The signed-in email itself is rendered by
// UsageMeter next door. Hidden in local-first stub mode — no backend, no
// accounts.

import { useState } from "react";

import { AuthDialog } from "@/components/AuthDialog";
import { Button } from "@/components/ui/button";
import { isBackendConfigured } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export function AuthControls() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isBackendConfigured()) return null;

  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
    } catch {
      // Cookie may already be gone/expired; hydrate on next load settles it.
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => void signOut()}
      >
        {busy ? "Signing out…" : "Sign out"}
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
        Sign in
      </Button>
      <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
