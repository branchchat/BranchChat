import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

import { joinWaitlist } from "@/lib/waitlist";
import { cn } from "@/lib/utils";

type State = "idle" | "loading" | "done";

export function WaitlistForm({
  source = "landing",
  className,
}: {
  source?: string;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || state === "loading") return;
    setState("loading");
    setError(null);
    try {
      await joinWaitlist(value, source);
      setState("done");
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Please try again.");
    }
  };

  if (state === "done") {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border border-foreground/15 bg-secondary/60 px-4 py-3.5 text-sm",
          className,
        )}
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="size-3" strokeWidth={3} />
        </span>
        <span className="text-foreground">
          You're on the list — we'll send your invite soon.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn("w-full", className)} noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Email address"
          className={cn(
            "h-11 flex-1 rounded-xl border bg-background px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground",
            "focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/30",
            error && "border-destructive/60",
          )}
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="bc-press inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-foreground px-5 text-sm font-medium text-background shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-foreground/90 disabled:opacity-70"
        >
          {state === "loading" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Joining…
            </>
          ) : (
            <>
              Join waitlist
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Invite-only early access. No spam, unsubscribe anytime.
        </p>
      )}
    </form>
  );
}
