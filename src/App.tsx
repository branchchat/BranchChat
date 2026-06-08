import { Routes, Route, Navigate } from "react-router-dom"

import { Landing } from "@/pages/Landing"
import { AppGate } from "@/pages/AppGate"
import { Privacy } from "@/pages/Privacy"
import { Terms } from "@/pages/Terms"
import { CookieConsent } from "@/components/CookieConsent"

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AppGate />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CookieConsent />
    </>
  )
}

export default App
