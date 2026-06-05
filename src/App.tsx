import { Canvas } from "@/components/Canvas"

function App() {
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <h1 className="text-sm font-semibold tracking-tight">BranchChat</h1>
      </header>
      <main className="min-h-0 flex-1">
        <Canvas />
      </main>
    </div>
  )
}

export default App
