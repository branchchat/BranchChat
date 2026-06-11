// Toolbar-footer control for optional server-side sync (signed-in users).
//
// Renders nothing for anonymous users or when no backend is configured — sync
// simply doesn't exist for them; the app stays purely local. For signed-in
// users it's a one-click on/off with a live status line.

import { useEffect, useState } from "react";
import { Cloud, CloudOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isBackendConfigured } from "@/lib/api";
import {
  getSyncStatus,
  isSyncEnabled,
  onSyncStatus,
  setSyncEnabled,
  syncNow,
  type SyncStatus,
} from "@/lib/sync";
import { useAuthStore } from "@/store/authStore";

export function SyncToggle() {
  const user = useAuthStore((s) => s.user);
  const [enabled, setEnabled] = useState(isSyncEnabled);
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);

  useEffect(() => onSyncStatus(setStatus), []);
  // Catch up on anything that changed while signed out / disabled.
  useEffect(() => {
    if (user && enabled) void syncNow();
  }, [user, enabled]);

  if (!user || !isBackendConfigured()) return null;

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setSyncEnabled(next);
  };

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-xs text-muted-foreground"
        onClick={toggle}
        aria-pressed={enabled}
        title={
          enabled
            ? "Chats back up to your account and follow you across devices"
            : "Chats stay only in this browser"
        }
      >
        {!enabled ? (
          <CloudOff className="size-3.5" />
        ) : status.state === "syncing" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Cloud className="size-3.5" />
        )}
        {enabled ? "Sync on" : "Sync off"}
      </Button>
      {enabled && status.state === "error" && (
        <p role="alert" className="px-2 text-[11px] text-destructive">
          Sync paused: {status.message}
        </p>
      )}
    </div>
  );
}
