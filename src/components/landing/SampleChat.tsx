// A solid, monochrome preview of an ADVANCED branching session — an ML debugging
// task (push a plateaued ResNet-50 past 82% val accuracy) that forks into two
// fully-fleshed strategies and compares them. Fewer, larger, detailed bubbles
// laid out as a clean binary tree (no crossing edges).
//
// Static layout: on load, nodes POP IN with a short stagger and the active path's
// edges DRAW in (alternatives fade in dashed). No scroll coupling — the canvas is
// solid. Reduced-motion safe (everything just shows; see index.css).

import { GitBranch } from "lucide-react";

import { cn } from "@/lib/utils";

type Role = "user" | "assistant" | "branch";
type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "w-[clamp(120px,20%,156px)]",
  md: "w-[clamp(150px,25%,194px)]",
  lg: "w-[clamp(176px,28%,224px)]",
};

function Node({
  left,
  top,
  delay,
  role,
  size = "md",
  label,
  text,
  code,
  meta,
  active,
  caret,
  running,
}: {
  left: number;
  top: number;
  delay: number;
  role: Role;
  size?: Size;
  label?: string;
  text?: string;
  code?: string;
  meta?: string;
  active?: boolean;
  caret?: boolean;
  running?: boolean;
}) {
  return (
    <div
      className={cn(
        "bc-node-in absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-3 shadow-sm",
        SIZE[size],
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

      {text && (
        <p className="text-[12.5px] leading-relaxed text-foreground/85">
          {text}
          {caret && (
            <span className="bc-caret ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[2px] bg-foreground/70 align-middle" />
          )}
        </p>
      )}

      {code && (
        <pre className="mt-2 overflow-hidden whitespace-pre rounded-md bg-secondary px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-foreground/80">
          {code}
        </pre>
      )}

      {meta && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <span className="size-1 rounded-full bg-foreground/50" />
          {meta}
        </div>
      )}
    </div>
  );
}

export function SampleChat() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="relative rounded-2xl border bg-card shadow-sm">
        {/* live indicator */}
        <div
          className="bc-fade absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border bg-card/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur"
          style={{ animationDelay: "0.1s" }}
        >
          <span className="bc-pulse size-1.5 rounded-full bg-foreground/70 text-foreground/40" />
          live preview
        </div>

        <div className="overflow-x-auto">
          <div className="relative h-[560px] w-full min-w-[600px] sm:h-[580px]">
            {/* dotted canvas grid */}
            <div className="pointer-events-none absolute inset-0 bc-grid text-foreground/[0.07]" />

            {/* edges — clean binary tree, no crossings. active path draws in (solid),
                the alternative fades in (dashed). */}
            <svg
              className="absolute inset-0 h-full w-full text-border"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {/* root → assistant (active) */}
              <line x1="50" y1="9" x2="50" y2="30" pathLength={1} className="bc-edge" style={{ animationDelay: "0.4s" }} stroke="currentColor" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
              {/* assistant → two branches */}
              <line x1="50" y1="30" x2="34" y2="53" pathLength={1} className="bc-edge" style={{ animationDelay: "0.8s" }} stroke="currentColor" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
              <line x1="50" y1="30" x2="66" y2="53" className="bc-fade" style={{ animationDelay: "0.9s" }} stroke="currentColor" strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              {/* branch → answer */}
              <line x1="34" y1="53" x2="34" y2="80" pathLength={1} className="bc-edge" style={{ animationDelay: "1.2s" }} stroke="currentColor" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
              <line x1="66" y1="53" x2="66" y2="80" className="bc-fade" style={{ animationDelay: "1.3s" }} stroke="currentColor" strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            </svg>

            {/* nodes — fewer, bigger, detailed; pop in on load */}
            <Node
              left={50}
              top={9}
              delay={0.15}
              role="user"
              size="md"
              text="Our ResNet-50 plateaus at 82% val accuracy and overfits after epoch 12 — how do we push past it?"
            />
            <Node
              left={50}
              top={30}
              delay={0.5}
              role="assistant"
              size="md"
              active
              text="Two high-ROI paths worth comparing head-to-head: regularize the current model harder, or fine-tune a stronger pretrained backbone."
            />

            <Node
              left={34}
              top={53}
              delay={0.85}
              role="branch"
              size="sm"
              label="regularize"
              active
              text="Harden augmentation + reg"
            />
            <Node
              left={66}
              top={53}
              delay={0.95}
              role="branch"
              size="sm"
              label="transfer"
              running
              text="Swap to ConvNeXt-T"
            />

            <Node
              left={34}
              top={80}
              delay={1.25}
              role="assistant"
              size="lg"
              active
              caret
              text="RandAugment + Mixup (α=0.2), label smoothing 0.1, dropout 0.3, cosine LR — closes the train/val gap."
              code={"aug  = RandAugment(2, 9)\nloss = CE(smoothing=0.1)\nopt  = AdamW(3e-4, wd=5e-4)"}
              meta="≈86% val · gap ↓"
            />
            <Node
              left={66}
              top={80}
              delay={1.35}
              role="assistant"
              size="lg"
              text="Fine-tune ConvNeXt-T (ImageNet-1k): freeze the stem, train the head @1e-3 for 5 epochs, then unfreeze @1e-5 for 10 more."
              meta="≈91% val · 3× fewer epochs"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
