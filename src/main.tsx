import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import posthog from 'posthog-js'
import { PostHogProvider } from '@posthog/react'
import './index.css'
import App from './App.tsx'

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2026-01-30',
  session_recording: {
    // Per-route privacy: the PostHog project baseline is permissive (only
    // passwords masked) so the public landing page is fully visible in
    // replays. The /app chat workspace is wrapped in `.ph-mask` (see
    // AppChat.tsx); here we censor ALL text and input values inside that
    // subtree, so conversation content + the composer never leave the user's
    // screen, while the UI itself stays visible for UX analysis.
    maskAllInputs: false,
    maskInputOptions: { password: true },
    maskTextSelector: '.ph-mask, .ph-mask *',
    maskInputFn: (text, element) => {
      const inChat = element?.closest?.('.ph-mask') != null
      const isPassword = element?.getAttribute?.('type') === 'password'
      return inChat || isPassword ? '*'.repeat(text.length) : text
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PostHogProvider>
  </StrictMode>,
)
