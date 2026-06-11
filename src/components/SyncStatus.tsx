// Toolbar-footer sync status (signed-in users). Read-only on purpose: sync is
// always on — there's no toggle to accidentally leave off and lose chats to a
// dead browser. Renders nothing for anonymous users or when no backend is
// configured (the app is purely local there, so there's nothing to report).

import { useEffect, useState } from "react";
import { AlertTriangle, Cloud, Loader2 } from "lucide-react";

import { isBackendConfigured } from "@/lib/api";
import { getSyncStatus, onSyncStatus, syncNow, type SyncStatus as Status } from "@/lib/sync";
import { useAuthStore } from "@/store/authStore";

export function SyncStatus() {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<Status>(getSyncStatus);

  useEffect(() => onSyncStatus(setStatus), []);
  // Catch up on anything that changed while signed out.
  useEffect(() => {
    if (user) void syncNow();
  }, [user]);

  if (!user || !isBackendConfigured()) return null;

  const error = status.state === "error";
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"
      title="Chats back up to your account automatically and follow you across devices"
    >
      {status.state === "syncing" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : error ? (
        <AlertTriangle className="size-3.5 text-destructive" />
      ) : (
        <Cloud className="size-3.5" />
      )}
      {error ? (
        <span role="alert" className="text-destructive">
          Sync error: {status.message}
        </span>
      ) : (
        <span>{status.state === "syncing" ? "Syncing…" : "Synced"}</span>
      )}
    </div>
  );
}
