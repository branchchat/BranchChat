import { lazy, Suspense } from "react"
import { Routes, Route, Navigate } from "react-router-dom"

import { Landing } from "@/pages/Landing"
import { CookieConsent } from "@/components/CookieConsent"

// Landing ("/") stays eager — it's the indexed entry route, so we don't want a
// chunk round-trip before first paint. Everything else is lazy so the heavy
// chat shell (React Flow / @xyflow/react, the chat store wiring) splits out of
// the landing bundle: it's only fetched when /app is actually visited, which
// is the biggest LCP/INP win for the marketing page. Named exports are mapped
// to `default` for React.lazy.
const AppGate = lazy(() =>
  import("@/pages/AppGate").then((m) => ({ default: m.AppGate })),
)
const Beta = lazy(() =>
  import("@/pages/Beta").then((m) => ({ default: m.Beta })),
)
const Privacy = lazy(() =>
  import("@/pages/Privacy").then((m) => ({ default: m.Privacy })),
)
const Terms = lazy(() =>
  import("@/pages/Terms").then((m) => ({ default: m.Terms })),
)
const ResetPassword = lazy(() =>
  import("@/pages/ResetPassword").then((m) => ({ default: m.ResetPassword })),
)
const VerifyEmail = lazy(() =>
  import("@/pages/VerifyEmail").then((m) => ({ default: m.VerifyEmail })),
)

function App() {
  return (
    <>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<AppGate />} />
          <Route path="/beta" element={<Beta />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <CookieConsent />
    </>
  )
}

export default App
