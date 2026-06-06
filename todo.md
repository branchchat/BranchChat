# BranchChat Todo

This file is for Claude/human coordination after the handoff. Keep it current when starting or finishing work, especially because two separate Claude Max accounts may work on this repo.

## Coordination Rules

- Work on separate branches unless explicitly pairing on the same change.
- Before starting: `git status -sb`, `git pull --ff-only`, and add a short note under "Active Work".
- Before pushing: run relevant checks, update this file if the todo state changed, and push a focused commit.
- Avoid rewriting `main` history. Do not force-push unless the human explicitly asks.
- If both accounts touch the same high-risk files (`chatStore.ts`, `Canvas.tsx`, `Toolbar.tsx`, backend auth/rate limit files), coordinate through this todo first.

## Active Work

- **Jayden (frontend) — branch `jayden/frontend`**: Rebuilding the frontend from scratch on top of the handoff docs. Done so far:
  - Vite + React + TS + Tailwind + shadcn/ui scaffold.
  - Milestone 2 "data core" — `src/types/chat.ts` (`ChatNode`, `ChatSessionState`) and `src/store/chatStore.ts` (Zustand persisted to `branchchat-storage`, one chat with a root system node, `selectNode` + placeholder `addNode`).
  - Milestone 3 "the canvas" — `src/components/Canvas.tsx` (React Flow graph from the store: pan/zoom, background, controls, minimap, click-to-`selectNode`), `src/components/ChatNode.tsx` (shadcn Card node), `src/lib/treeLayout.ts` (pure top-down layout). Render + select only; nodes auto-laid-out, not draggable.
  - Milestone 4 "continue + branch" — `chatStore` gains `addUserMessage` (linear continuation) and `branchFromNode` (alternate timeline + branch label + journal entry); each creates a user node + a loading assistant node, filled by a stubbed reply after ~0.5s. `buildHistoryForNode` applies the doc's truncation caps (20/24k; coding 28/48k). New `src/components/InputBar.tsx` composer (Send/Branch, Enter-to-send) mounted in `App.tsx`.
  - Milestone 5 "wire the real backend call" — new `src/lib/api.ts` (`requestChatReply` → `POST {VITE_API_BASE}/api/chat/{gemini|ollama}`, cookie auth, `ChatApiError` surfacing backend `detail`). `chatStore` now calls the real provider when `VITE_API_BASE` is set, else falls back to the stub (stays local-first). Added `retryAssistant`, `isError` node state + red styling, typed env in `src/vite-env.d.ts`, and `.env.example` (`.env` gitignored).

  **Backend contract assumed** from `README (1).md` / `architecture.md`: stateless `POST /api/chat/gemini` with `{ node_id, message, history, linked_context, coding_mode, personalization }` → `{ node_id, reply }`. @partner: if the live endpoint path or payload differs, flag here and I'll adjust `src/lib/api.ts`. **Not yet verified against a live server** — default `npm run dev` still stubs; set `VITE_API_BASE` to hit the real backend. Next: live verify against the running backend, then context-links/retry UI/tags. Owning `src/store/chatStore.ts`, `src/types/chat.ts`, `src/lib/api.ts`, `src/components/Canvas.tsx`, `src/components/ChatNode.tsx`, `src/components/InputBar.tsx`, and `src/lib/treeLayout.ts` for now — coordinate here before touching them.

- **Roshaan (backend + landing) — branch `roshaan/landing`** — @Jayden's Claude, please read:

  **The whole product is LIVE in production.** 🎉
  - **Backend**: built + deployed on **Railway at https://api.branch-chat.com** (FastAPI, Docker). DB on **Supabase** (Postgres + RLS, via least-priv `app_user` over the transaction pooler). Endpoints: `/api/chat/{gemini,ollama}` (Gemini + fallback), full **auth** (`/api/auth/*`: signup/login/logout/me/usage/reset/verify — argon2, JWT cookie, lockout, enumeration-safe), **daily quotas**, share schema, **`POST /api/waitlist`**. **Your `src/lib/api.ts` contract is CORRECT and live — change nothing.** Keep `credentials: 'include'`.
  - **Frontend**: I built a **landing page + waitlist** on this branch (`roshaan/landing`, off your `jayden/frontend`). **Your chat is UNTOUCHED** — I only re-routed it. Added `react-router-dom` + `motion`: `/` = landing, `/app` = your real chat behind a **soft dev passphrase gate** (`letmebranch`, or `/app?key=letmebranch`). New files are all mine: `src/pages/{Landing,AppGate}.tsx`, `src/components/AppChat.tsx` (= your old App.tsx content), `src/components/landing/*`, `src/lib/{waitlist,devAccess}.ts`; `App.tsx`/`main.tsx` now route; `public/_redirects` for SPA. Built with design skills (impeccable / emil-design-eng / design-taste-frontend / ui-ux-pro-max); monochrome + Geist, animated.

  **⚠️ What changed that affects YOU:**
  1. **Cloudflare Pages production branch is now `roshaan/landing`, NOT `jayden/frontend`.** So pushing to `jayden/frontend` no longer deploys to **branch-chat.com**. (Live site = this branch.)
  2. **To ship your chat work to production:** keep building on `jayden/frontend` as normal, then when ready **merge `jayden/frontend` → `roshaan/landing`** (coordinate here first). The gated `/app` route renders YOUR `Canvas`/`ChatNode`/`InputBar`/`chatStore`, so merging brings your improvements (Outline/Connections/Reading, tags, compare, share) straight to the live `/app`. Or we agree to make this the trunk / merge both to `main`.
  3. **Don't rename/move** `src/components/{Canvas,ChatNode,InputBar}.tsx` or the store — `AppChat.tsx` imports them. Don't change the `api.ts` request/response shape (backend depends on it).
  4. **Run locally:** `npm run dev`, set `VITE_API_BASE=https://api.branch-chat.com` (or `http://localhost:8000` with the backend running) — chat now gets REAL Gemini replies. Dev gate passphrase: `letmebranch`.
  5. Backend CORS currently allows `branch-chat.com` + `www.branch-chat.com` only. If you serve from another origin, tell me and I'll allowlist it.

- **Pre-beta security audit done (2026-06-06) — no frontend action needed.** I ran a full backend audit (auth/RLS/injection/secrets/config/rate-limit/headers/deps) and pushed hardening to the `backend` branch (prod-secret boot guard, request body-size cap, cookie/JWT fixes, non-root container). **Frontend verdict: clean** — zero XSS sinks, `npm audit` = 0, no client-shipped secrets, and the `letmebranch` dev gate is correctly a *soft* gate (real protection is the cookie auth + server quotas, not the passphrase). Your `api.ts` contract is unchanged. Details: `docs/backend-security.md` on the `backend` branch.

- **Analytics + legal layer (2026-06-06) — branch `roshaan/landing` (Roshaan) — @Jayden's Claude, FYI (now DONE):**

  **PostHog is now live on the frontend** (set up via `npx @posthog/wizard` on `roshaan/landing`). Wired in `src/main.tsx` (`posthog.init` + `PostHogProvider`); keys in gitignored `.env` (`VITE_PUBLIC_POSTHOG_KEY` / `VITE_PUBLIC_POSTHOG_HOST`, US cloud), documented in `.env.example`. **"Detailed" mode is on: autocapture, pageviews, AND session replay/heatmaps.** SPA pageviews are automatic via `defaults: '2026-01-30'` (`capture_pageview: 'history_change'`) — do **NOT** add manual react-router pageview capture or pageviews will double-count.

  **Cookie/privacy compliance — DONE (Roshaan, 2026-06-06), committed on `roshaan/landing`:**
  - [x] **Cookie consent banner** (`src/components/CookieConsent.tsx`) gates PostHog. `main.tsx` now inits with `opt_out_capturing_by_default: true`; Accept → `opt_in_capturing()`, Decline → `opt_out_capturing()`. Choice persists (`src/lib/consent.ts`); footer **"Cookie settings"** re-opens it to withdraw consent. **Verified: pre-consent only config/flags load — no `/e/` events, no `/s/` recording; after Accept, capture starts.**
  - [x] **Privacy Policy** (`src/pages/Privacy.tsx`, `/privacy`) + **Terms** (`src/pages/Terms.tsx`, `/terms`) via shared `src/components/legal/LegalLayout.tsx`; linked from landing + legal footers.
  - [x] **Session-replay PII masking** — per-route `.ph-mask` on `/app` (chat text + inputs censored; landing visible). **Leave intact** — the consent gate composes with this.
  - [x] Routes registered in `App.tsx`; `<CookieConsent />` mounted globally.
  - [x] **Production wired (2026-06-06):** added `VITE_PUBLIC_POSTHOG_KEY` + `VITE_PUBLIC_POSTHOG_HOST` to Cloudflare Pages env (they were missing — PostHog wasn't actually running in prod before) and redeployed. **Reverse proxy live:** prod routes PostHog through `https://t.branch-chat.com` (PostHog Managed proxy + a `t` CNAME in Cloudflare, gray-cloud / DNS-only). Verified on live branch-chat.com — config loads via the proxy, consent-gated.
  - [ ] **Data-deletion path** (PostHog per-person deletion via API) — not wired yet; low priority during early beta.

  ⚠️ **HUMAN TODO before launch (not code):** `src/lib/legal.ts` now has real values — `entity` = "BranchChat", `jurisdiction` = New Jersey, `contactEmail` = `branchchat@gmail.com`. The policy/ToS copy is still a *template draft* — have the wording reviewed by a lawyer or a service (Termly/iubenda) before relying on it. Not legally certified.

## Priority Backlog

### P0 - Keep The App Stable

- [ ] Verify production env on deploy targets: `VITE_API_BASE`, `VITE_PROVIDER`, `GEMINI_API_KEY`, `JWT_SECRET_KEY`, `ANON_IDENTITY_SALT`, `COOKIE_SECURE`, `COOKIE_SAMESITE`, `CORS_ORIGINS`, `ALLOWED_HOSTS`, `ENABLE_LEGACY_TREE_API=false`.
- [ ] Confirm Gemini primary/fallback model names in production and document any provider-side quota limits.
- [ ] Run backend tests before backend releases: `.\.venv\Scripts\python.exe -m unittest discover tests`.
- [ ] Run frontend checks before UI releases: `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run lint`.

### P1 - UX Improvements

- [ ] Add a normal "Load demo conversation" action for existing users, probably in `Toolbar.tsx`, so users do not need to reset onboarding localStorage.
- [ ] Add clearer visual feedback after search result navigation, such as a brief selected-node pulse or toast that says the matching node was opened.
- [ ] Revisit zoom/readability: when viewing many nodes, consider a minimap/outline/sidebar preview instead of relying only on canvas zoom.
- [ ] Improve mobile workspace browser density and ensure search result cards do not squeeze important context.
- [ ] Add an "open selected branch in focused view" mode for long conversations where full-tree zoom makes text hard to read.

### P1 - Tree Layout And Canvas

- [ ] Add more layout tests around collision avoidance, including multiple occupied rows and coding-mode node sizes.
- [ ] Consider extracting layout helpers from `chatStore.ts` into a dedicated testable module.
- [ ] Verify branch creation from collapsed nodes and search navigation into collapsed subtrees.
- [ ] Check that imported JSON sessions normalize node size/position fields consistently.

### P1 - Auth, Usage, And Billing Readiness

- [ ] Test login/signup/reset flows end-to-end against the deployed backend, including cross-site cookies.
- [ ] Add a regression test for successful login after repeated `/api/auth/me` and `/api/auth/usage` calls.
- [ ] Make quota UI copy match backend limits exactly in production.
- [ ] Decide whether email verification should gate authenticated daily quota or only account trust.

### P2 - Backend Cleanup

- [ ] Update `README_BACKEND.md` to remove stale OpenAI-default wording and align it with the Gemini-first stateless chat path.
- [ ] Decide whether legacy DB-tree routes should remain, be hidden harder, or be removed.
- [ ] Consider Redis or another shared limiter if backend scales beyond one process.
- [ ] Add structured logs around provider fallback, quota denials, and share creation.

### P2 - Persistence And Portability

- [ ] Add explicit localStorage export/import versioning for future migrations.
- [ ] Consider optional server-side sync for authenticated users, while preserving local-first behavior.
- [ ] Add safeguards for very large local sessions before localStorage becomes fragile.

### P2 - Testing

- [ ] Add React Testing Library coverage for `Toolbar` search result rendering and `openNode` dispatch.
- [ ] Add browser/e2e smoke test: load demo, search phrase, click result, assert node is selected/centered.
- [ ] Add backend contract tests for `/api/chat/gemini`, `/api/chat/summarize`, and `/api/share`.

## Recently Completed

- [x] Gemini upstream 504/fallback handling improved.
- [x] New branches stay centered when room exists and avoid existing node collisions when needed.
- [x] Duplicate broad auth middleware rate limit removed; route-specific auth limits remain.
- [x] Search prompt matches show more context and navigate to the exact matching node.
- [x] Latest search navigation changes pushed to `main` in commit `551bf2f`.

## Useful Commands

```powershell
# Frontend
npm.cmd test
npm.cmd run build
npm.cmd run lint
npm.cmd run dev -- --host 127.0.0.1 --port 5173

# Backend
.\.venv\Scripts\python.exe -m unittest discover tests
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Git
git status -sb
git pull --ff-only
git log --oneline -5
```
