// Header chip showing today's message quota, plus the signed-in email.
//
// Numbers come straight from `/api/auth/usage` — the backend is the only
// authority on limits (todo "make quota UI copy match backend limits
// exactly"), so nothing here hardcodes 10/50. Renders nothing in local-first
// stub mode (no backend → no quota) or until the first fetch lands.

import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

export function UsageMeter() {
  const user = useAuthStore((s) => s.user);
  const usage = useAuthStore((s) => s.usage);
  const hydrate = useAuthStore((s) => s.hydrate);

  // Initial hydrate; no-ops when no backend is configured.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!usage) return null;

  const ratio = usage.limit > 0 ? usage.used / usage.limit : 0;
  const exhausted = usage.remaining <= 0;

  return (
    <div
      className="flex items-center gap-3 text-xs text-muted-foreground"
      title={
        `${usage.used} of ${usage.limit} daily messages used` +
        (user ? "" : " (anonymous — sign in for a higher limit)")
      }
    >
      {user && <span className="max-w-48 truncate">{user.email}</span>}

      <div className="flex items-center gap-1.5">
        <div
          role="progressbar"
          aria-valuenow={usage.used}
          aria-valuemin={0}
          aria-valuemax={usage.limit}
          className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full bg-primary transition-[width]",
              exhausted
                ? "bg-destructive"
                : ratio >= 0.8 && "bg-amber-500 dark:bg-amber-400",
            )}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
        <span className={cn("tabular-nums", exhausted && "text-destructive")}>
          {usage.used}/{usage.limit} today
        </span>
      </div>
    </div>
  );
}
