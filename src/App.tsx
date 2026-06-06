import { Routes, Route, Navigate } from "react-router-dom"

import { Landing } from "@/pages/Landing"
import { AppGate } from "@/pages/AppGate"

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<AppGate />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
