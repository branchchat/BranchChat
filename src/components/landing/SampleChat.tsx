// A live, monochrome preview of an ADVANCED branching session (a deep-research /
// coding task) that EXPANDS AS IT SCROLLS PAST — the chat box grows a bit and
// reveals new bubbles as the conversation branches. It sits in normal page flow
// (one scrollbar, no scroll-jacking): `useScroll` is anchored to the element's
// top edge, so a single comfortable scroll past it drives the reveal.
// Reduced-motion safe (full tree shown at once).

import { useRef } from "react";
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

const WIN = 0.08; // scroll-progress span of a single reveal

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
  const y = useTransform(progress, [from, from + WIN], [10, 0]);
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

export function SampleChat() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // Anchored to the element's TOP edge only → growing the box never feeds back
  // into progress. Reveal plays over ~one screen of normal scrolling.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "start 0.12"],
  });

  // the box itself expands a bit as the conversation fills in
  const height = useTransform(scrollYProgress, [0, 0.72], [384, 560]);

  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div ref={ref} className="relative rounded-2xl border bg-card shadow-sm">
        {/* live indicator */}
        <div className="bc-fade absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border bg-card/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
          <span className="bc-pulse size-1.5 rounded-full bg-foreground/70 text-foreground/40" />
          live preview
        </div>

        <div className="overflow-x-auto">
          <motion.div
            className="relative w-full min-w-[580px]"
            style={{ height: reduce ? 560 : height }}
          >
            {/* dotted canvas grid */}
            <div className="pointer-events-none absolute inset-0 bc-grid text-foreground/[0.07]" />

            {/* edges */}
            <svg
              className="absolute inset-0 h-full w-full text-border"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <Edge progress={scrollYProgress} from={0.04} x1={50} y1={8} x2={50} y2={24} draw />
              <Edge progress={scrollYProgress} from={0.16} x1={50} y1={24} x2={20} y2={43} draw />
              <Edge progress={scrollYProgress} from={0.18} x1={50} y1={24} x2={50} y2={43} />
              <Edge progress={scrollYProgress} from={0.2} x1={50} y1={24} x2={80} y2={43} />
              <Edge progress={scrollYProgress} from={0.36} x1={20} y1={43} x2={20} y2={63} draw />
              <Edge progress={scrollYProgress} from={0.44} x1={50} y1={43} x2={50} y2={63} />
              <Edge progress={scrollYProgress} from={0.52} x1={80} y1={43} x2={80} y2={63} />
              <Edge progress={scrollYProgress} from={0.66} x1={20} y1={63} x2={50} y2={84} draw />
              <Edge progress={scrollYProgress} from={0.68} x1={50} y1={63} x2={50} y2={84} />
              <Edge progress={scrollYProgress} from={0.7} x1={80} y1={63} x2={50} y2={84} />
            </svg>

            {/* nodes — grow in as you scroll past */}
            <Node progress={scrollYProgress} from={0.0} left={50} top={8} role="user" text="Design a rate limiter for our API gateway — 10k rps, multi-region" />
            <Node progress={scrollYProgress} from={0.1} left={50} top={24} role="assistant" active caret text="Three fit: token bucket, sliding-window log, and counter — all Redis-backed." />
            <Node progress={scrollYProgress} from={0.2} left={20} top={43} role="branch" label="token bucket" active text="You — show the Redis Lua impl" />
            <Node progress={scrollYProgress} from={0.24} left={50} top={43} role="branch" label="sliding log" text="You — memory cost at 1M keys?" />
            <Node progress={scrollYProgress} from={0.28} left={80} top={43} role="branch" label="compare" running text="You — compare p99 latency" />
            <Node progress={scrollYProgress} from={0.4} left={20} top={63} role="assistant" active code={"local t = redis.call('TIME')[1]\nlocal n = redis.call('GET', k) or burst"} />
            <Node progress={scrollYProgress} from={0.48} left={50} top={63} role="assistant" text="~24 B/entry → ~24 MB at 1M keys; trim old with ZREMRANGEBYSCORE." />
            <Node progress={scrollYProgress} from={0.56} left={80} top={63} role="assistant" text="Token bucket p99 ~0.4 ms · sliding log ~1.1 ms at 1M keys." />
            <Node progress={scrollYProgress} from={0.68} left={50} top={84} role="assistant" active caret text="Recommendation: token bucket for 10k rps; sliding log only if you need exact fairness." />
          </motion.div>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Scroll to watch the conversation branch ↓
      </p>
    </section>
  );
}
