import { Canvas } from "@/components/Canvas"
import { InputBar } from "@/components/InputBar"

function App() {
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <h1 className="text-sm font-semibold tracking-tight">BranchChat</h1>
      </header>
      <main className="min-h-0 flex-1">
        <Canvas />
      </main>
      <footer className="shrink-0">
        <InputBar />
      </footer>
    </div>
  )
}

export default App
