import { useState } from "react"
import { PanelLeft } from "lucide-react"

import { AuthControls } from "@/components/AuthControls"
import { Canvas } from "@/components/Canvas"
import { InputBar } from "@/components/InputBar"
import { Toolbar } from "@/components/Toolbar"
import { UsageMeter } from "@/components/UsageMeter"
import { Button } from "@/components/ui/button"

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-svh flex-col">
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
          <UsageMeter />
          <AuthControls />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && <Toolbar />}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1">
            <Canvas />
          </main>
          <footer className="shrink-0">
            <InputBar />
          </footer>
        </div>
      </div>
    </div>
  )
}

export default App
