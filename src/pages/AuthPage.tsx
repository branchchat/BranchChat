// Shared centered layout for the standalone auth-token pages (/reset-password,
// /verify-email). Brand mark links home; a card holds the page content.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Brand } from "@/components/landing/Brand";

export function AuthPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4">
      <Link to="/" aria-label="BranchChat home">
        <Brand />
      </Link>
      <div className="w-full max-w-sm rounded-xl bg-card p-6 text-sm ring-1 ring-foreground/10">
        <h1 className="mb-4 text-base font-semibold">{title}</h1>
        {children}
      </div>
      <Link
        to="/app"
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Go to the app →
      </Link>
    </div>
  );
}
