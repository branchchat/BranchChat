// A live, monochrome preview of an ADVANCED branching session (a deep-research /
// coding task): one prompt fans into multiple branches, one of which goes deeper
// into a Redis implementation. Real node cards + edges, not a screenshot.
//
// Motion is motivated and one-shot: nodes pop in with a short stagger, the
// active path's edges DRAW in (alternatives fade in dashed), the active node
// shows a typing caret, and one branch shows a "running" pulse. Reduced-motion
// safe (see index.css). On small screens the canvas scrolls horizontally, like
// the real product canvas.

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
  code,
  active,
  caret,
  running,
}: {
  left: number;
  top: number;
  delay: number;
  role: Role;
  label?: string;
  text?: string;
  code?: string;
  active?: boolean;
  caret?: boolean;
  running?: boolean;
}) {
  return (
    <div
      className={cn(
        "bc-node-in absolute w-[clamp(120px,22%,178px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-2.5 shadow-sm",
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
            {running && (
              <span className="bc-pulse ml-0.5 size-1.5 rounded-full bg-foreground/70 text-foreground/40" />
            )}
          </span>
        )}
      </div>
      {code ? (
        <pre className="overflow-hidden whitespace-pre-wrap rounded-md bg-secondary px-2 py-1.5 font-mono text-[10px] leading-relaxed text-foreground/80">
          {code}
        </pre>
      ) : (
        <p className="line-clamp-2 text-[12px] leading-snug text-foreground/85">
          {text}
          {caret && (
            <span className="bc-caret ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[2px] bg-foreground/70 align-middle" />
          )}
        </p>
      )}
    </div>
  );
}

export function SampleChat({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-x-auto rounded-2xl border bg-card shadow-sm",
        className,
      )}
    >
      {/* live indicator */}
      <div
        className="bc-fade absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border bg-card/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur"
        style={{ animationDelay: "0.1s" }}
      >
        <span className="bc-pulse size-1.5 rounded-full bg-foreground/70 text-foreground/40" />
        live preview
      </div>

      <div className="relative h-[440px] w-full min-w-[560px] sm:h-[520px]">
        {/* dotted canvas grid */}
        <div className="pointer-events-none absolute inset-0 bc-grid text-foreground/[0.07]" />

        {/* edges: active path draws in (solid); alternative branches fade in (dashed) */}
        <svg
          className="absolute inset-0 h-full w-full text-border"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line x1="50" y1="10" x2="50" y2="31" pathLength={1} className="bc-edge" style={{ animationDelay: "0.35s" }} stroke="currentColor" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
          <line x1="50" y1="31" x2="18" y2="59" pathLength={1} className="bc-edge" style={{ animationDelay: "0.85s" }} stroke="currentColor" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
          <line x1="18" y1="59" x2="18" y2="85" pathLength={1} className="bc-edge" style={{ animationDelay: "1.4s" }} stroke="currentColor" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
          <line x1="50" y1="31" x2="50" y2="59" className="bc-fade" style={{ animationDelay: "0.95s" }} stroke="currentColor" strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <line x1="50" y1="31" x2="82" y2="59" className="bc-fade" style={{ animationDelay: "1.05s" }} stroke="currentColor" strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <line x1="50" y1="59" x2="50" y2="85" className="bc-fade" style={{ animationDelay: "1.5s" }} stroke="currentColor" strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <line x1="82" y1="59" x2="82" y2="85" className="bc-fade" style={{ animationDelay: "1.6s" }} stroke="currentColor" strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* nodes */}
        <Node left={50} top={10} delay={0.15} role="user" text="Design a rate limiter for our API gateway — 10k rps, multi-region" />
        <Node left={50} top={31} delay={0.5} role="assistant" active caret text="Three fit: token bucket, sliding-window log, and counter — all Redis-backed." />
        <Node left={18} top={59} delay={0.95} role="branch" label="token bucket" active text="You — show the Redis Lua impl" />
        <Node left={50} top={59} delay={1.05} role="branch" label="sliding log" text="You — memory cost at 1M keys?" />
        <Node left={82} top={59} delay={1.15} role="branch" label="compare" text="You — compare p99 latency" />
        <Node left={18} top={85} delay={1.5} role="assistant" active code={"local t = redis.call('TIME')[1]\nlocal n = redis.call('GET', k) or burst"} />
        <Node left={50} top={85} delay={1.6} role="assistant" text="~24 B/key → ~24 MB at 1M keys; trim old entries with ZREMRANGEBYSCORE." />
        <Node left={82} top={85} delay={1.7} role="assistant" text="Token bucket p99 ~0.4 ms vs sliding log ~1.1 ms at 1M keys." />
      </div>
    </div>
  );
}
