// A live, monochrome preview of a branching conversation — real node cards +
// connecting edges, not a screenshot. Nodes pop in with a short stagger and the
// edges fade in after, telling the "one thread splits into many" story. Motion
// is motivated (storytelling) and one-shot; nothing loops. Reduced-motion safe.

import { GitBranch } from "lucide-react";

import { cn } from "@/lib/utils";

type Role = "user" | "assistant" | "branch";

function Node({
  left,
  top,
  delay,
  role,
  label,
  text,
  active,
}: {
  left: number;
  top: number;
  delay: number;
  role: Role;
  label?: string;
  text: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "bc-node-in absolute w-[clamp(130px,40%,182px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-3 shadow-sm",
        active && "border-foreground/25 ring-1 ring-foreground/10",
        role === "branch" && "border-dashed",
      )}
      style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {role === "user" && (
          <span className="inline-flex items-center rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
            You
          </span>
        )}
        {role === "assistant" && (
          <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Assistant
          </span>
        )}
        {role === "branch" && (
          <span className="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <GitBranch className="size-2.5" />
            {label}
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-[12.5px] leading-snug text-foreground/85">
        {text}
      </p>
    </div>
  );
}

export function SampleChat({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative h-[400px] w-full overflow-hidden rounded-2xl border bg-card shadow-sm sm:h-[440px]",
        className,
      )}
    >
      {/* dotted canvas grid */}
      <div className="pointer-events-none absolute inset-0 bc-grid text-foreground/[0.07]" />

      {/* connecting edges (behind the cards) */}
      <svg
        className="absolute inset-0 h-full w-full text-border"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          x1="40" y1="14" x2="40" y2="44"
          className="bc-fade" style={{ animationDelay: "0.35s" }}
          stroke="currentColor" strokeWidth={1.25} vectorEffect="non-scaling-stroke"
        />
        <line
          x1="40" y1="44" x2="19" y2="80"
          className="bc-fade" style={{ animationDelay: "0.85s" }}
          stroke="currentColor" strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
        />
        <line
          x1="40" y1="44" x2="61" y2="80"
          className="bc-fade" style={{ animationDelay: "0.95s" }}
          stroke="currentColor" strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* nodes */}
      <Node
        left={40} top={14} delay={0.15} role="user"
        text="Plan a focused 3-day Tokyo trip"
      />
      <Node
        left={40} top={44} delay={0.5} role="assistant" active
        text="Day 1 — Shibuya & Harajuku, then a sunset at the Tokyo Metropolitan building…"
      />
      <Node
        left={19} top={80} delay={0.9} role="branch" label="budget"
        text="You — keep it under ¥40k total"
      />
      <Node
        left={61} top={80} delay={1.0} role="branch" label="food"
        text="You — go deeper on where to eat"
      />
    </div>
  );
}
