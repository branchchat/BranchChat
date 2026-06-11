// Header chip showing today's message quota, plus the signed-in email.
//
// Numbers come straight from `/api/auth/usage` — the backend is the only
// authority on limits (todo "make quota UI copy match backend limits
// exactly"), so nothing here hardcodes 10/50. Renders nothing in local-first
// stub mode (no backend → no quota) or until the first fetch lands.
//
// Two buckets when the backend exposes them: the standard daily messages and
// the separate coding-mode allowance (backend `0a19026`). The coding bar only
// appears when `usage.coding` is present, so an older backend still renders.

import { useEffect } from "react";
import { Code2 } from "lucide-react";

import type { UsageBucket } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

// One quota bar + its "used/limit" readout. `label` rides the tooltip and the
// aria-label so the standard and coding bars are distinguishable to AT.
function QuotaBar({
  used,
  limit,
  remaining,
  label,
  suffix,
  icon,
}: UsageBucket & {
  label: string;
  suffix: string;
  icon?: React.ReactNode;
}) {
  const ratio = limit > 0 ? used / limit : 0;
  const exhausted = remaining <= 0;

  return (
    <div className="flex items-center gap-1.5" title={`${used} of ${limit} ${label}`}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit}
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
      <span
        className={cn(
          "flex items-center gap-0.5 tabular-nums",
          exhausted && "text-destructive",
        )}
      >
        {icon}
        {used}/{limit} {suffix}
      </span>
    </div>
  );
}

export function UsageMeter() {
  const user = useAuthStore((s) => s.user);
  const usage = useAuthStore((s) => s.usage);
  const hydrate = useAuthStore((s) => s.hydrate);

  // Initial hydrate; no-ops when no backend is configured.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!usage) return null;

  return (
    <div
      className="flex items-center gap-3 text-xs text-muted-foreground"
      title={user ? undefined : "Anonymous — sign in for a higher limit"}
    >
      {user && <span className="max-w-48 truncate">{user.email}</span>}

      <QuotaBar
        used={usage.used}
        limit={usage.limit}
        remaining={usage.remaining}
        label="daily messages used"
        suffix="today"
      />

      {usage.coding && (
        <QuotaBar
          used={usage.coding.used}
          limit={usage.coding.limit}
          remaining={usage.coding.remaining}
          label="coding-mode messages used"
          suffix="code"
          icon={<Code2 className="size-3" />}
        />
      )}
    </div>
  );
}
