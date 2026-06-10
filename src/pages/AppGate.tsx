import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { AppChat } from "@/components/AppChat";
import { Brand } from "@/components/landing/Brand";
import { checkUrlKey, hasDevAccess, tryPassphrase } from "@/lib/devAccess";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/lib/usePageMeta";

export function AppGate() {
  // Distinct title so the gated app doesn't inherit the marketing homepage
  // title (the /app route is Disallow'ed in robots.txt — no description needed).
  usePageMeta("BranchChat App");

  // Unlock from a stored flag, or from /app?key=<passphrase> on first load.
  const [unlocked, setUnlocked] = useState(
    () => hasDevAccess() || checkUrlKey(),
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  if (unlocked) return <AppChat />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tryPassphrase(value)) {
      setUnlocked(true);
    } else {
      setError(true);
      setValue("");
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6">
      <div className="bc-rise w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Brand />
          <h1 className="mt-6 text-xl font-semibold tracking-tight">
            Developer access
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The chat is in private development. Enter the team passphrase to
            continue.
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            placeholder="Passphrase"
            aria-label="Developer passphrase"
            className={cn(
              "h-11 rounded-xl border bg-background px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground",
              "focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/30",
              error && "border-destructive/60",
            )}
          />
          <button
            type="submit"
            className="bc-press h-11 rounded-xl bg-foreground text-sm font-medium text-background shadow-sm hover:bg-foreground/90"
          >
            Enter
          </button>
          {error && (
            <p className="text-xs text-destructive">
              Incorrect passphrase. Try again.
            </p>
          )}
        </form>
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
