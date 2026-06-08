import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Brand } from "@/components/landing/Brand";
import { openCookieSettings } from "@/lib/consent";

// Shared chrome for the Privacy / Terms pages: sticky nav, readable prose
// column, and a footer matching the landing page.
export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground antialiased">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link to="/" aria-label="BranchChat home">
            <Brand />
          </Link>
          <Link
            to="/"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: {updated}
        </p>
        <div className="mt-10 space-y-9">{children}</div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © 2026 BranchChat. All rights reserved.
          </p>
          <nav className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link
              to="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <button
              type="button"
              onClick={openCookieSettings}
              className="transition-colors hover:text-foreground"
            >
              Cookie settings
            </button>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// A titled prose block used by the legal pages.
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {heading}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-1 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
