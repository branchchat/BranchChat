// A live, monochrome preview of an ADVANCED branching session (a deep-research /
// coding task) that GROWS AS YOU SCROLL — the conversation builds out bubble by
// bubble and the tree branches, simulating an active chat.
//
// Implementation: a tall scroll "track" pins the canvas (sticky) while you scroll
// through it; `useScroll` turns scroll position into 0→1 progress, and each node /
// edge reveals as progress crosses its threshold. Real node cards + drawn edges,
// not a screenshot. Fully reduced-motion safe (everything shows at once).

import { useRef, type ReactNode } from "react";
import { GitBranch } from "lucide-react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";

import { cn } from "@/lib/utils";

type Role = "user" | "assistant" | "branch";

const WIN = 0.07; // how much scroll-progress a single reveal spans

function Node({
  progress,
  from,
  left,
  top,
  role,
  label,
  text,
  code,
  active,
  caret,
  running,
}: {
  progress: MotionValue<number>;
  from: number;
  left: number;
  top: number;
  role: Role;
  label?: string;
  text?: string;
  code?: string;
  active?: boolean;
  caret?: boolean;
  running?: boolean;
}) {
  const reduce = useReducedMotion();
  const opacity = useTransform(progress, [from, from + WIN], [0, 1]);
  const y = useTransform(progress, [from, from + WIN], [12, 0]);
  const scale = useTransform(progress, [from, from + WIN], [0.96, 1]);

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      <motion.div
        style={reduce ? undefined : { opacity, y, scale }}
        className={cn(
          "w-[clamp(116px,22%,178px)] rounded-xl border bg-card p-2.5 shadow-sm",
          active && "border-foreground/25 ring-1 ring-foreground/10",
          role === "branch" && "border-dashed",
        )}
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
      </motion.div>
    </div>
  );
}

function Edge({
  progress,
  from,
  x1,
  y1,
  x2,
  y2,
  draw,
}: {
  progress: MotionValue<number>;
  from: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  draw?: boolean; // solid active path draws in; dashed alternatives fade in
}) {
  const reduce = useReducedMotion();
  const pathLength = useTransform(progress, [from, from + WIN], [0, 1]);
  const opacity = useTransform(progress, [from, from + WIN * 0.5], [0, 1]);

  if (draw) {
    return (
      <motion.line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
        style={reduce ? { pathLength: 1 } : { pathLength }}
      />
    );
  }
  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="currentColor"
      strokeWidth={1.25}
      strokeDasharray="3 3"
      vectorEffect="non-scaling-stroke"
      style={reduce ? { opacity: 1 } : { opacity }}
    />
  );
}

export function SampleChat({ children }: { children?: ReactNode }) {
  const trackRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  return (
    // tall scroll track → drives the reveal while the canvas stays pinned
    <section ref={trackRef} className="relative h-[260vh]">
      {children}
      <div className="sticky top-0 flex min-h-[100dvh] items-center px-6">
        <div className="mx-auto w-full max-w-4xl">
          <div className="relative rounded-2xl border bg-card shadow-sm">
            {/* live indicator */}
            <div className="bc-fade absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border bg-card/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
              <span className="bc-pulse size-1.5 rounded-full bg-foreground/70 text-foreground/40" />
              live preview
            </div>

            <div className="overflow-x-auto">
              <div className="relative h-[68vh] min-h-[460px] w-full min-w-[580px]">
                {/* dotted canvas grid */}
                <div className="pointer-events-none absolute inset-0 bc-grid text-foreground/[0.07]" />

                {/* edges */}
                <svg
                  className="absolute inset-0 h-full w-full text-border"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <Edge progress={scrollYProgress} from={0.04} x1={50} y1={7} x2={50} y2={22} draw />
                  <Edge progress={scrollYProgress} from={0.16} x1={50} y1={22} x2={20} y2={40} draw />
                  <Edge progress={scrollYProgress} from={0.18} x1={50} y1={22} x2={50} y2={40} />
                  <Edge progress={scrollYProgress} from={0.2} x1={50} y1={22} x2={80} y2={40} />
                  <Edge progress={scrollYProgress} from={0.34} x1={20} y1={40} x2={20} y2={61} draw />
                  <Edge progress={scrollYProgress} from={0.42} x1={50} y1={40} x2={50} y2={61} />
                  <Edge progress={scrollYProgress} from={0.5} x1={80} y1={40} x2={80} y2={61} />
                  <Edge progress={scrollYProgress} from={0.66} x1={20} y1={61} x2={50} y2={82} draw />
                  <Edge progress={scrollYProgress} from={0.68} x1={50} y1={61} x2={50} y2={82} />
                  <Edge progress={scrollYProgress} from={0.7} x1={80} y1={61} x2={50} y2={82} />
                </svg>

                {/* nodes — grow in as you scroll */}
                <Node progress={scrollYProgress} from={0.0} left={50} top={7} role="user" text="Design a rate limiter for our API gateway — 10k rps, multi-region" />
                <Node progress={scrollYProgress} from={0.08} left={50} top={22} role="assistant" active caret text="Three fit: token bucket, sliding-window log, and counter — all Redis-backed." />
                <Node progress={scrollYProgress} from={0.2} left={20} top={40} role="branch" label="token bucket" active text="You — show the Redis Lua impl" />
                <Node progress={scrollYProgress} from={0.24} left={50} top={40} role="branch" label="sliding log" text="You — memory cost at 1M keys?" />
                <Node progress={scrollYProgress} from={0.28} left={80} top={40} role="branch" label="compare" running text="You — compare p99 latency" />
                <Node progress={scrollYProgress} from={0.38} left={20} top={61} role="assistant" active code={"local t = redis.call('TIME')[1]\nlocal n = redis.call('GET', k) or burst"} />
                <Node progress={scrollYProgress} from={0.46} left={50} top={61} role="assistant" text="~24 B/entry → ~24 MB at 1M keys; trim old with ZREMRANGEBYSCORE." />
                <Node progress={scrollYProgress} from={0.54} left={80} top={61} role="assistant" text="Token bucket p99 ~0.4 ms · sliding log ~1.1 ms at 1M keys." />
                <Node progress={scrollYProgress} from={0.74} left={50} top={82} role="assistant" active caret text="Recommendation: token bucket for 10k rps; sliding log only if you need exact fairness." />
              </div>
            </div>
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Scroll to watch the conversation branch ↓
          </p>
        </div>
      </div>
    </section>
  );
}
