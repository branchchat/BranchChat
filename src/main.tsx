import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import posthog from 'posthog-js'
import { PostHogProvider } from '@posthog/react'
import './index.css'
import App from './App.tsx'
import { getConsent } from '@/lib/consent'

// The email-link pages land with a live single-use secret in the URL
// (/verify-email?token=…, /reset-password?token=…). Those pages strip it from
// the address bar (lib/authToken.ts), but the initial $pageview fires before
// React mounts — so every captured property is scrubbed here too. Otherwise a
// usable password-reset token ends up stored in PostHog.
const TOKEN_IN_URL = /([?&]token=)[^&#\s"']+/gi

function scrubTokens<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(TOKEN_IN_URL, '$1[redacted]') as T
  }
  if (Array.isArray(value)) {
    return value.map(scrubTokens) as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = scrubTokens(v)
    return out as T
  }
  return value
}

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2026-01-30',
  // GDPR/ePrivacy: don't capture, record, or set analytics cookies until the
  // user accepts in the cookie banner (see CookieConsent.tsx).
  opt_out_capturing_by_default: true,
  before_send: (event) => {
    if (!event) return event
    if (event.properties) event.properties = scrubTokens(event.properties)
    if (event.$set) event.$set = scrubTokens(event.$set)
    if (event.$set_once) event.$set_once = scrubTokens(event.$set_once)
    return event
  },
  session_recording: {
    // Per-route privacy: the PostHog project baseline is permissive so the
    // public landing page is fully visible in replays. The /app chat
    // workspace is wrapped in `.ph-mask` (see AppChat.tsx); here we censor
    // ALL text and input values inside that subtree, so conversation content
    // + the composer never leave the user's screen, while the UI itself stays
    // visible for UX analysis. Passwords AND emails are masked everywhere —
    // login/signup/waitlist emails are PII and don't belong in replays.
    maskAllInputs: false,
    maskInputOptions: { password: true, email: true },
    maskTextSelector: '.ph-mask, .ph-mask *',
    maskInputFn: (text, element) => {
      const inChat = element?.closest?.('.ph-mask') != null
      const type = element?.getAttribute?.('type')
      const isSensitive = type === 'password' || type === 'email'
      return inChat || isSensitive ? '*'.repeat(text.length) : text
    },
  },
})

// Re-apply a previously stored consent choice. PostHog starts opted out, so we
// only resume capturing if the user already accepted in a past visit.
if (getConsent() === 'accepted') {
  posthog.opt_in_capturing()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PostHogProvider>
  </StrictMode>,
)
