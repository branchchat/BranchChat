import { Link } from "react-router-dom";
import { Columns2, GitBranch, Link2 } from "lucide-react";

import { Brand } from "@/components/landing/Brand";
import { SampleChat } from "@/components/landing/SampleChat";
import { WaitlistForm } from "@/components/landing/WaitlistForm";

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
    <div className="min-h-[100dvh] bg-background text-foreground antialiased">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Brand />
          <a
            href="#waitlist"
            className="bc-press hidden h-9 items-center rounded-xl bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/90 sm:inline-flex"
          >
            Join waitlist
          </a>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-8 pt-16 sm:pt-24">
        <div className="mx-auto max-w-2xl text-center">
          <div
            className="bc-rise inline-flex items-center gap-2 rounded-full border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground"
            style={{ animationDelay: "0.05s" }}
          >
            <span className="size-1.5 rounded-full bg-foreground" />
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
          className="bc-rise mx-auto mt-16 max-w-3xl"
          style={{ animationDelay: "0.42s" }}
        >
          <SampleChat />
        </div>
      </section>

      {/* ── Capabilities (hairline-divided row, not floating cards) ──────── */}
      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <div className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-3">
          {capabilities.map((c) => (
            <div key={c.title} className="bg-background p-6 sm:p-7">
              <c.icon className="size-5 text-foreground" strokeWidth={1.75} />
              <h3 className="mt-4 text-sm font-semibold">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────────────── */}
      <section className="border-t border-border/60">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center sm:py-28">
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
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <Brand />
          <p className="text-xs text-muted-foreground">
            © 2026 BranchChat. All rights reserved.
          </p>
          <Link
            to="/app"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Developer access →
          </Link>
        </div>
      </footer>
    </div>
  );
}
