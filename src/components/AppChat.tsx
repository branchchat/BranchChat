// The live chat workspace, rendered under the gated /app route.
//
// This is the full app shell (header + toggleable Toolbar sidebar + canvas +
// composer) that used to live in App.tsx before roshaan/landing turned App.tsx
// into the router. The `.ph-mask` wrapper censors all chat text + input values
// in PostHog session replay (see session_recording config in main.tsx); the
// landing page sits outside this subtree and stays visible.

import { useState } from "react"
import { BookOpen, GitCompare, PanelLeft } from "lucide-react"
import { Link } from "react-router-dom"

import { AuthControls } from "@/components/AuthControls"
import { Canvas } from "@/components/Canvas"
import { CompareView } from "@/components/CompareView"
import { FeedbackButton } from "@/components/FeedbackButton"
import { FocusView } from "@/components/FocusView"
import { InputBar } from "@/components/InputBar"
import { Toolbar } from "@/components/Toolbar"
import { UsageMeter } from "@/components/UsageMeter"
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner"
import { Button } from "@/components/ui/button"
import { useChatStore } from "@/store/chatStore"

export function AppChat() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const openCompare = useChatStore((s) => s.openCompare)
  const openFocusView = useChatStore((s) => s.openFocusView)

  return (
    <div className="ph-mask flex h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            aria-pressed={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <PanelLeft className="size-4" />
          </Button>
          <h1 className="text-sm font-semibold tracking-tight">BranchChat</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={openFocusView}
          >
            <BookOpen className="size-4" />
            Read
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={openCompare}
          >
            <GitCompare className="size-4" />
            Compare
          </Button>
          <FeedbackButton />
          <UsageMeter />
          <AuthControls />
          <Link
            to="/"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Home
          </Link>
        </div>
      </header>
      <VerifyEmailBanner />
      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && (
          <>
            {/* Mobile-only backdrop: tap to dismiss the drawer (it overlays the
                canvas on small screens; on sm+ the sidebar is an inline column
                and this is hidden). */}
            <div
              className="absolute inset-0 z-20 bg-black/20 sm:hidden"
              aria-hidden
              onClick={() => setSidebarOpen(false)}
            />
            <Toolbar
              onNavigate={() => {
                // On mobile the drawer covers the canvas, so close it after the
                // user picks a chat / search result.
                if (window.matchMedia("(max-width: 639px)").matches) {
                  setSidebarOpen(false)
                }
              }}
            />
          </>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1">
            <Canvas />
          </main>
          <footer className="shrink-0">
            <InputBar />
          </footer>
        </div>
      </div>
      <CompareView />
      <FocusView />
    </div>
  )
}
