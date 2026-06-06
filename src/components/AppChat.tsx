// The live chat workspace (formerly App.tsx). Jayden's Canvas / InputBar are
// used unchanged — this just re-homes them under the gated /app route and adds
// a link back to the landing page.

import { Link } from "react-router-dom";

import { Canvas } from "@/components/Canvas";
import { InputBar } from "@/components/InputBar";

export function AppChat() {
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h1 className="text-sm font-semibold tracking-tight">BranchChat</h1>
        <Link
          to="/"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Home
        </Link>
      </header>
      <main className="min-h-0 flex-1">
        <Canvas />
      </main>
      <footer className="shrink-0">
        <InputBar />
      </footer>
    </div>
  );
}
