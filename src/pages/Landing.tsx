import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Columns2, GitBranch, Link2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { Brand } from "@/components/landing/Brand";
import { SampleChat } from "@/components/landing/SampleChat";
import { WaitlistForm } from "@/components/landing/WaitlistForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { openCookieSettings } from "@/lib/consent";

// Scroll-reveal: fade + rise as the element enters the viewport (once).
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

const capabilities = [
  {
    icon: GitBranch,
    title: "Branch anywhere",
    body: "Fork from any message to explore an alternative — without losing the original thread.",
  },
  {
    icon: Columns2,
    title: "Compare paths",
    body: "Put two branches side by side and see which answer actually wins.",
  },
  {
    icon: Link2,
    title: "Link context",
    body: "Pull context across branches so the model remembers what matters.",
  },
];

export function Landing() {
  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground antialiased">
      {/* faint canvas texture behind the hero (ties to the product, less flat) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] bc-grid text-foreground/[0.05] [mask-image:radial-gradient(58%_46%_at_50%_28%,black,transparent)]"
        aria-hidden="true"
      />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Brand />
          <div className="flex items-center gap-4">
            <ThemeToggle className="-mr-1" />
            <Link
              to="/beta"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Beta access
            </Link>
            <a
              href="#waitlist"
              className="bc-press hidden h-9 items-center rounded-xl bg-foreground px-4 text-sm font-medium text-background transition-transform hover:-translate-y-0.5 hover:bg-foreground/90 sm:inline-flex"
            >
              Join waitlist
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-8 pt-16 sm:pt-24">
        <div className="mx-auto max-w-2xl text-center">
          <div
            className="bc-rise inline-flex items-center gap-2 rounded-full border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground"
            style={{ animationDelay: "0.05s" }}
          >
            <span className="bc-pulse size-1.5 rounded-full bg-foreground text-foreground/40" />
            Early access · invite-only
          </div>

          <h1
            className="bc-rise mt-6 text-[2.5rem] font-semibold tracking-tight sm:text-6xl"
            style={{ animationDelay: "0.12s", lineHeight: 1.04 }}
          >
            Think in branches,
            <br className="hidden sm:block" /> not threads.
          </h1>

          <p
            className="bc-rise mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg"
            style={{ animationDelay: "0.2s" }}
          >
            BranchChat turns AI conversations into a visual tree — explore
            alternatives, compare paths, and never lose a thread.
          </p>

          <div
            id="waitlist"
            className="bc-rise mx-auto mt-8 max-w-md scroll-mt-24"
            style={{ animationDelay: "0.28s" }}
          >
            <WaitlistForm source="hero" />
          </div>
        </div>

        {/* live product preview */}
        <div
          className="bc-rise mx-auto mt-16 max-w-4xl"
          style={{ animationDelay: "0.42s" }}
        >
          <SampleChat />
        </div>
      </section>

      {/* ── Capabilities (hairline-divided row, reveal on scroll) ────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-3">
          {capabilities.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.08}>
              <div className="h-full bg-background p-6 transition-colors hover:bg-secondary/40 sm:p-7">
                <c.icon className="size-5 text-foreground" strokeWidth={1.75} />
                <h3 className="mt-4 text-sm font-semibold">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {c.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────────────── */}
      <section className="border-t border-border/60">
        <Reveal className="mx-auto max-w-2xl px-6 py-20 text-center sm:py-28">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Get early access
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            We're rolling out invites weekly. Join the waitlist and we'll reach
            out.
          </p>
          <div className="mx-auto mt-7 max-w-md text-left">
            <WaitlistForm source="closing-cta" />
          </div>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <Brand />
          <p className="text-xs text-muted-foreground">
            © 2026 BranchChat. All rights reserved.
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Link
              to="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <button
              type="button"
              onClick={openCookieSettings}
              className="transition-colors hover:text-foreground"
            >
              Cookie settings
            </button>
            <Link
              to="/app"
              className="transition-colors hover:text-foreground"
            >
              Developer access →
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
