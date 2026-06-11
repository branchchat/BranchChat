// /beta — beta-tester recruitment page.
//
// A focused surface (separate from the marketing landing) you can link from
// outreach / social. Primary CTA creates an account (lands in the
// pending-approval state until a founder approves it via /api/admin/beta);
// a secondary "Sign in" covers returning testers — both deep-link to
// /app?auth=… which opens the auth dialog on the right form, and a signed-in
// approved tester goes straight to the app. (The general waitlist still
// lives on the landing page.)

import { Link } from "react-router-dom";
import { Check, GitBranch, MessageSquarePlus, Sparkles } from "lucide-react";

import { Brand } from "@/components/landing/Brand";
import { usePageMeta } from "@/lib/usePageMeta";

const EXPECTATIONS = [
  {
    icon: Sparkles,
    title: "Early access",
    body: "Get into the app before public launch and use it for real work.",
  },
  {
    icon: GitBranch,
    title: "Shape the product",
    body: "Your branches, comparisons, and edge cases steer what we build next.",
  },
  {
    icon: MessageSquarePlus,
    title: "A direct line",
    body: "Send feedback right from the app — we read every note.",
  },
];

export function Beta() {
  usePageMeta(
    "Join the BranchChat beta",
    "Apply for early access to BranchChat — a visual, branching way to explore AI conversations.",
  );

  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground antialiased">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bc-grid text-foreground/[0.05] [mask-image:radial-gradient(58%_46%_at_50%_28%,black,transparent)]"
        aria-hidden="true"
      />

      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link to="/" aria-label="BranchChat home">
            <Brand />
          </Link>
          <Link
            to="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 pb-24 pt-16 sm:pt-24">
        <div className="text-center">
          <div className="bc-rise inline-flex items-center gap-2 rounded-full border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
            <span className="bc-pulse size-1.5 rounded-full bg-foreground text-foreground/40" />
            Private beta · invite-only
          </div>

          <h1
            className="bc-rise mt-6 text-[2rem] font-semibold tracking-tight sm:text-5xl"
            style={{ animationDelay: "0.08s", lineHeight: 1.05 }}
          >
            Help shape BranchChat.
          </h1>

          <p
            className="bc-rise mx-auto mt-4 max-w-md text-base text-muted-foreground sm:text-lg"
            style={{ animationDelay: "0.16s" }}
          >
            We're inviting a small group of testers to explore AI conversations
            as branching trees. Create an account to request access — we
            approve testers in waves and email you when you're in.
          </p>

          <div
            className="bc-rise mx-auto mt-8 max-w-md"
            style={{ animationDelay: "0.24s" }}
          >
            <Link
              to="/app?auth=signup"
              className="bc-press inline-flex h-11 w-full max-w-xs items-center justify-center rounded-xl bg-foreground text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/90"
            >
              Create your account
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                to="/app?auth=signin"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <ul
          className="bc-rise mx-auto mt-14 grid max-w-md gap-5"
          style={{ animationDelay: "0.32s" }}
        >
          {EXPECTATIONS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-secondary/50">
                <Icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mx-auto mt-14 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3.5" />
          Your chats stay in your browser — local-first by default.
        </p>
      </main>
    </div>
  );
}
