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

  **Backend contract assumed** from `README (1).md` / `architecture.md`: stateless `POST /api/chat/gemini` with `{ node_id, message, history, linked_context, coding_mode, personalization }` → `{ node_id, reply }`. @partner: if the live endpoint path or payload differs, flag here and I'll adjust `src/lib/api.ts`.

  **Verified (frontend side) against a mock backend** — drove the real dev app in headless Chrome against a local mock `/api/chat/gemini`:
  - Happy path: real `POST` fires (not the stub) with the exact documented payload (`history` is the path up to, not including, the new message; message sent separately); reply renders into the assistant node; no console errors.
  - Error path: with the backend down, the assistant node flips to `isError` with a friendly message + red styling.
  - Still **not** verified against the partner's *real* server — the mock implements the contract from the docs. @partner: please confirm your live endpoint accepts this shape.

  **Live-verified against the real backend (2026-06-06)** — checked out `backend` (`ae4c612`) in a worktree, stood up Docker Postgres + migrations (0001+0002), ran the suite (**36/36 pass**), started uvicorn on :8000, and drove the real dev app in headless Chrome with `VITE_API_BASE=http://localhost:8000`:
  - **Contract confirmed live**: the canvas POSTs the exact documented payload to `POST /api/chat/gemini`; backend accepts it (schema in `app/schemas/chat.py` mirrors `api.ts` verbatim). No `GEMINI_API_KEY` on this machine, so the provider stage returned **503 `{"detail":"The AI provider is not configured."}`** — and the assistant node correctly flipped to `isError` rendering that backend detail. 422 on invalid payloads, CORS + security headers correct for `localhost:5173`.
  - **Auth verified live over HTTP**: signup (generic 201) → login (HttpOnly `branchchat_token`, `UserOut`) → `/me` (200 with cookie, 401 without) → `/usage` (anon 0/10, authed 0/50). Wrong password → uniform 401.
  - Remaining for a full happy-path check: a real `GEMINI_API_KEY` (or Ollama) locally, or the deployed backend URL.
  - **@partner heads-up (test harness, fresh machine)**: the pytest suite needs `ENV=test` (switches the engine to NullPool — `app/db/session.py:76`) and `DATABASE_DIRECT_URL` pointing at the admin role. Without `ENV=test`, 4 auth tests fail with cross-event-loop `RuntimeError`s (pooled asyncpg connections vs per-test TestClient loops). Worth adding to the docs/README next to the pytest command.

  Next: the rebuild is feature-complete against the backlog. Remaining is **not code**: (a) deploy-env config — `RESEND_API_KEY`/`RESEND_FROM_EMAIL` + `APP_BASE_URL` (auth emails actually send), `VITE_PUBLIC_POSTHOG_KEY` (analytics), the Cloudflare Pages production-branch repoint + Supabase `waitlist` table; (b) @Roshaan still owes a reply on the two quota questions below. Optional polish if continuing: more component/RTL tests (Toolbar search, AuthDialog), context-links, tags, full happy-path Gemini verify (needs a key). Owning the frontend `src/` (stores, lib, components, pages) for now — coordinate here before touching.

  - **@partner (Roshaan), two open questions from the usage-meter live run** — both fine if intended, just confirming:
    1. Quota is charged **before** the provider call (`app/routers/chat.py` docstring says this ordering is deliberate), so a 502/503 (provider down/unconfigured) still consumes a message. During a Gemini outage users' daily quota burns on failed sends — your call whether that's acceptable for beta or worth a refund-on-5xx.
    2. `GET /api/auth/usage` always reports `kind: "standard"` — the separate coding-mode counter (10/day) isn't readable over the API yet, so the meter can't show it when coding mode lands. Additive field/param would do it.

  ### @Roshaan — catch-up since your last check-in (2026-06-07)

  You've been heads-down; here's everything on `jayden/frontend` you haven't seen. 12 PRs merged, all live-verified against your real backend.

  - **Your `roshaan/landing` is now merged into `jayden/frontend` (#11).** Landing page, waitlist, react-router, PostHog (consent-gated), cookie consent, and legal pages all came in. I rehomed the full chat shell into `src/components/AppChat.tsx` under your gated `/app` route and resolved the entry-file restructure against ~10 PRs of divergence. **Your branch shows as merged — I did the integration, you don't need to.** The Cloudflare Pages production-branch repoint + the Supabase `waitlist` table remain your/our call (didn't touch deploy).
  - **Full auth UI built against your contract and verified end-to-end** against your backend (Docker PG + uvicorn): usage meter + `authStore` on `/api/auth/{me,usage}` (#2), signup/login/logout modal (#4), and the email-token flows — `/reset-password`, `/verify-email`, forgot-password, resend (#12). For #12 I scraped real tokens from your dev email log. **`api.ts` contract unchanged.**
  - **Still need from you — the two quota questions above** (charge-before-provider burns quota on 5xx; `/usage` only exposes `standard`). Both are "fine if intended, just confirm."
  - **Deploy env your work introduced** (when we deploy): `RESEND_API_KEY`/`RESEND_FROM_EMAIL` + `APP_BASE_URL` (so auth emails actually send — dev only logs them), `VITE_PUBLIC_POSTHOG_KEY` (analytics).
  - FYI, pure-frontend (no backend impact): Toolbar + chat management (#5), cross-chat search (#6), demo conversation (#7), search-pulse (#8), retry + persist versioning (#1), vitest + jsdom test harness, 28 tests (#9/#10).

- **Roshaan (backend) — branch `backend`**: Scaffolding the FastAPI backend (`app/`) from scratch off `main`. Done so far:
  - Foundation: `app/core/config.py` (Pydantic settings), `app/db/session.py` (async engine, 10–20 pool, pooler-aware for Supabase, `rls_tx` GUC helper), security headers + CSRF origin-check middleware, layered rate limiter (Redis-ready interface).
  - Data model + migration `0001_initial`: `users`, `email_tokens`, `usage_counters`, `share_snapshots`, `login_attempts`, with indexes on every filtered/sorted column and **RLS enabled on all tables** (deny-by-default for Supabase's API; ownership policy + FORCE on `share_snapshots`). App connects as least-privilege `app_user` role (docker init creates it).
  - **`POST /api/chat/gemini` + `/api/chat/ollama`** — stateless, matches the frontend contract `{ node_id, message, history, linked_context, coding_mode, personalization } → { node_id, reply }`, errors as `{ detail }` (429 on quota). Gemini model fallback on timeout/5xx/429. Anonymous daily quota + network bucket; per-mode history/message truncation re-applied server-side.
  - PostHog analytics wrapper (no-op until keyed), `/health` + `/health/ready`, Dockerfile, `docker-compose.yml` (local Postgres), Alembic (async), `.env.backend.example`, `docs/backend-security.md`, tests (17 passing: health/headers, prompt truncation, identity, guardrails, chat contract).
  - **Verified:** syntax, import, all 17 tests. **Not yet verified live:** migration + RLS against Postgres (needs Docker Desktop running) and a real Gemini call (needs `GEMINI_API_KEY`).
  - **Auth milestone done + verified live** (commit pending): `app/routers/auth.py` — `POST /api/auth/{signup,login,logout,request-password-reset,reset-password,verify-email,resend-verification}`, `GET /api/auth/{me,usage}`. argon2id hashing, JWT in HttpOnly cookie, 5×-failure account lockout, single-use SHA-256-hashed email tokens, enumeration-safe responses (uniform 401 / generic signup+reset), timing-equalised login. PostHog events: user_signed_up (+ anon→user alias), user_logged_in, email_verified. Verified end-to-end against Docker Postgres + real Gemini: migration applied, **RLS ownership isolation proven**, real chat call returns over HTTP, 30 tests passing (incl. 12 auth edge-case + 1 quota, DB-backed). Fixed a `usage_counters.day` date-binding bug found only by the live run.
  - **@partner (Jayden):** contract matches your `src/lib/api.ts` exactly — don't change it. Next: share snapshots, then analytics/retention. Owning `app/`, `alembic/`, `docker-compose.yml`, `Dockerfile`, root `requirements*.txt` — coordinate here before touching them. Full integration details below 👇

### Landing page (branch `roshaan/landing`, off `jayden/frontend`) — @Jayden heads-up

- Built a marketing **landing page + waitlist** and gated the real chat. **Your Canvas/ChatNode/InputBar/chatStore are UNTOUCHED** — I only re-routed them.
- Added `react-router-dom`: `/` → new `src/pages/Landing.tsx`, `/app` → `src/pages/AppGate.tsx` (a soft dev passphrase gate, passphrase `letmebranch`, or `/app?key=letmebranch`) → renders `src/components/AppChat.tsx` (= your old App.tsx content). `src/App.tsx` + `src/main.tsx` now do routing; `public/_redirects` added for SPA deep-links.
- New files: `src/components/landing/{Brand,WaitlistForm,SampleChat}.tsx`, `src/lib/{waitlist,devAccess}.ts`. Monochrome, Geist, matches the theme (built with the impeccable / emil-design-eng / design-taste-frontend skills).
- Waitlist posts to backend `POST /api/waitlist` (new). **Not deployed yet** — needs Pages production branch repointed to `roshaan/landing` (or merged into `jayden/frontend`) + the `waitlist` table created on Supabase. Coordinate here before we change the Pages production branch, since it affects the live site.

#### Re: landing merge (from Jayden, 2026-06-06)

- **Let's merge `roshaan/landing` into `jayden/frontend` soon** — my next milestone is the auth screens (login/signup + `/reset-password` & `/verify-email` token routes), which need react-router. Your branch already adds it and restructures `src/App.tsx`/`src/main.tsx`; I don't want to rewrite the same entry files divergently. Merging the landing page (the *routing*, not the Pages production-branch repoint — that stays a separate human decision) unblocks me cleanly.
- **Sequencing/conflict heads-up**: I have two small PRs open into `jayden/frontend` (`jayden/retry-and-persist-versioning`, `jayden/usage-meter-authstore`). The usage-meter one edits `App.tsx` (mounts a `UsageMeter` chip in the header). Since your branch moves the old `App.tsx` content into `src/components/AppChat.tsx`, whoever merges second just moves that header mount into `AppChat.tsx` — trivial, but flagging so it doesn't surprise you.
- **Proposed order**: my two PRs land first (they're reviewed/small), then `roshaan/landing` merges into `jayden/frontend` and I'll resolve the `App.tsx`→`AppChat.tsx` move in the merge. If you'd rather rebase your branch on top yourself, also fine — your call, just say which here.

### Pre-beta security audit + hardening (2026-06-06, branch `backend`) — @Jayden FYI

Ran a full 4-track audit (auth/session/access-control · injection/RLS/secrets ·
config/rate-limit/headers/DoS · frontend/deps). **Verdict: production-safe with
the fixes below.** Full writeup + residual follow-ups in `docs/backend-security.md`.

- **Verified sound** (no action): RLS (forced ownership policy on `share_snapshots`,
  least-priv `app_user` NOBYPASSRLS, transaction-local GUC), all SQL parameterized
  (zero string-built SQL), argon2id + enumeration-safe/timing-equalised auth, CORS
  allow-list + CSRF origin check + full security headers, X-Forwarded-For spoof
  defence, server-side quotas, no client-shipped secrets, **`npm audit` = 0**, backend
  pins CVE-clean for the reachable surface. The frontend dev gate (`letmebranch`) is
  correctly a *soft* gate — real protection is the cookie auth + server quotas.
- **Fixed + pushed (commit `ccddea3`, 36 tests green):** prod now **refuses to boot
  with the default/weak `JWT_SECRET_KEY`/`ANON_IDENTITY_SALT`** (was the one critical
  gap — forgeable sessions); request **body-size cap → 413** (DoS); logout clears the
  cookie with matching attrs; JWT decode requires `exp`+`sub`; container runs **non-root**
  + `.dockerignore`.
- **⚠️ Deploy note:** the boot guard is fail-closed. If the Railway deploy after
  `ccddea3` fails, it means a required secret is missing/weak in the platform env —
  set `ENV=production`, a strong `JWT_SECRET_KEY` (≥32 random) and `ANON_IDENTITY_SALT`
  (≥16), and `COOKIE_SECURE=true`. Railway keeps the previous deploy running until the
  new one is healthy, so this can't take the site down. Full required-env list in the
  security doc.
- **No frontend action needed.** Jayden: the chat contract (`api.ts`) is unchanged;
  keep `credentials: 'include'`. If your deployed origin ever changes, tell me so I
  update `CORS_ORIGINS`/`ALLOWED_HOSTS`.
- **Tests:** backend now runs on **pytest** (`.\.venv\Scripts\python.exe -m pytest -q`),
  36 passing.

## Backend ↔ Frontend Integration Notes (from Roshaan / backend → Jayden + frontend Claude)

Everything the frontend needs to integrate. The backend lives in `app/` on branch
`backend` (pushed; PR `backend → main` open). Stateless: the browser stays the
source of truth for the tree.

### Run the frontend against the live backend
- Set frontend env: `VITE_API_BASE=http://localhost:8000`, `VITE_PROVIDER=gemini`.
  Leave `VITE_API_BASE` empty to keep using your local stub.
- Backend needs Docker Postgres up + a `GEMINI_API_KEY` (both already configured
  locally). Start it: `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
- Verified end-to-end: sending a message from the canvas returns a real Gemini
  reply through the backend (quota + RLS + fallback all live).

### Chat contract (unchanged — do NOT edit `api.ts`)
- `POST /api/chat/gemini` (and `/ollama`), `credentials: 'include'`.
- Request `{ node_id, message, history, linked_context, coding_mode, personalization? }`
  → Response `{ node_id, reply }`. `node_id` is an echoed correlation id.
- Errors are `{ "detail": "<human message>" }` with status:
  - **429** quota/rate-limit → show `detail` directly (it's user-facing copy).
  - **502** provider down (after Gemini fallback), **503** provider not configured,
    **422** invalid input. Your `ChatApiError` already surfaces `detail`.
- The backend re-applies the SAME truncation caps server-side (20/24k standard,
  28/48k coding) and caps `linked_context` to 4 blocks — defence in depth, no
  behaviour change for you.

### Cookies / auth (what the browser will carry)
- Two HttpOnly cookies set by the backend: `branchchat_anon_id` (anonymous quota,
  set on first chat) and `branchchat_token` (JWT session, set on login).
- Keep `credentials: 'include'` on every request (you already do).

### Auth endpoints (for when you build the auth screens)
- `POST /api/auth/signup` `{email, password(≥12)}` → 201 generic message.
  **Does NOT log you in** (deliberate, enumeration-safe). After signup, call login.
- `POST /api/auth/login` `{email, password}` → 200 `UserOut {id,email,email_verified,created_at}`, sets session cookie. Wrong creds → uniform **401 "Invalid email or password."** (never reveals if the account exists).
- `POST /api/auth/logout` → clears cookie.
- `GET /api/auth/me` → `UserOut` or **401** (use to hydrate `authStore`).
- `GET /api/auth/usage` → `{authenticated, kind, used, limit, remaining}` — drive the
  usage meter / the "Scope" budget display with this.
- `POST /api/auth/request-password-reset` `{email}` → always 200 generic.
- `POST /api/auth/reset-password` `{token, password}` and
  `POST /api/auth/verify-email` `{token}` → you need routes `/reset-password` and
  `/verify-email` that read `?token=...` from the URL and POST it. Email links point
  at `APP_BASE_URL` (set to your frontend origin).
- `POST /api/auth/resend-verification` (requires login).
- Quotas: anon **10/day**, authenticated **50/day**, coding-mode **10/day** (separate).

### I need ONE thing from you
- **Your exact frontend origins** for the CORS allow-list (`CORS_ORIGINS`). Right now
  it allows `http://localhost:5173` and `http://127.0.0.1:5173`. Tell me your dev port
  if different, and your deployed Pages URL when you have it. (Credentialed requests
  require explicit origins — no `*`.) In prod, cookies also flip to
  `SameSite=None; Secure` for cross-site — I handle that server-side.

### Optional, your call
- The target design's "Scope ~4,440 / 24,000" meter: backend can return token/usage
  info in the chat response if you'd rather show exact numbers than a char estimate.
  Say the word and I'll add it to the response (additive, non-breaking).

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

- **Homepage SEO pass (2026-06-10) — branch `roshaan/landing` (Roshaan) — @Jayden FYI, no action needed:**
  Ran a single-page SEO audit against live branch-chat.com (scored 38/100: title-only head, no description/OG/canonical/schema, and the SPA `/*` rewrite was serving the HTML shell with a 200 for `/robots.txt` and `/sitemap.xml`). Fixed on this branch:
  - `index.html`: keyworded title + meta description, canonical, full Open Graph + Twitter Card tags, `theme-color`, and JSON-LD (`Organization` + `WebSite` + `SoftwareApplication`). All in the static head, so crawlers and link unfurlers get it without JS.
  - New `public/robots.txt` (allows all, disallows `/app`, `/reset-password`, `/verify-email`; points at sitemap), `public/sitemap.xml` (`/`, `/privacy`, `/terms`), and `public/og-image.png` (1200x630 brand card). Static assets beat the `_redirects` SPA fallback on Pages, so these now serve correctly.
  - Checks: build green, 30/30 tests pass. The 3 lint errors are pre-existing (`CookieConsent.tsx` set-state-in-effect, badge/button fast-refresh) — not from this change.
  - **Search engine verification — ALL DONE (2026-06-10, account Branchchat@gmail.com).**
    - **Google Search Console:** verified the `https://branch-chat.com/` URL-prefix property via the **HTML-tag method** (meta `google-site-verification` in `index.html` head, commit `3b55f03`); sitemap submitted, 3 pages discovered.
    - **Bing Webmaster Tools** (feeds Microsoft Copilot citations): verified via meta `msvalidate.01` in `index.html` head (commit `6956ede`); sitemap submitted, processing. NOTE: the "Import from GSC" path returned "no sites" because Google's API hadn't propagated the just-verified property yet — used the manual meta-tag add instead, which is deterministic.
    - **CRITICAL: leave both `google-site-verification` and `msvalidate.01` meta tags in `index.html`** or the respective verifications drop.
    - Pages gotcha worth remembering: the HTML-**file** verification methods do NOT work on Cloudflare Pages — Pages 308-redirects `*.html` URLs (clean-URL behavior), so `/google<token>.html` and `BingSiteAuth.xml`-style `.html` files are unreachable at their exact path. Meta tags are the reliable method. (Non-`.html` static files like robots.txt / sitemap.xml / BingSiteAuth.xml serve fine.)
  - **`www.branch-chat.com` — DONE (2026-06-10, Cloudflare).** Added proxied CNAME `www` → `branchchat.pages.dev`, plus a Redirect Rule "Redirect from WWW to root" (wildcard `https://www.*` → `https://${1}`, 301). Verified live: `https://www.branch-chat.com/privacy` → 301 → `https://branch-chat.com/privacy`.
  - Remaining SEO follow-ups (not done): per-route `document.title` for `/privacy`, `/terms`, `/app` (they share the homepage title — @Jayden this touches your routing area, a tiny effect or react-helmet would do); main JS bundle is 861 kB (278 kB gzip) — code-splitting would help LCP/INP.

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

- [ ] Verify production env on deploy targets: `VITE_API_BASE`, `VITE_PROVIDER`, `GEMINI_API_KEY`, `JWT_SECRET_KEY`, `ANON_IDENTITY_SALT`, `COOKIE_SECURE`, `COOKIE_SAMESITE`, `CORS_ORIGINS`, `ALLOWED_HOSTS`, `ENABLE_LEGACY_TREE_API=false`, **`DB_USE_PGBOUNCER=true`** (required behind the Supabase transaction pooler, see below), `DB_SSL=true`.
- [ ] Confirm Gemini primary/fallback model names in production and document any provider-side quota limits.
- [ ] Run backend tests before backend releases: `.\.venv\Scripts\python.exe -m unittest discover tests`.
- [ ] Run frontend checks before UI releases: `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run lint`.

### P1 - UX Improvements

- [ ] Revisit zoom/readability: when viewing many nodes, consider a minimap/outline/sidebar preview instead of relying only on canvas zoom.
- [ ] Improve mobile workspace browser density and ensure search result cards do not squeeze important context.
- [ ] Add an "open selected branch in focused view" mode for long conversations where full-tree zoom makes text hard to read.
- [ ] **@Jayden — auto-pan/center the canvas to the newest node after Send/Branch.** Found 2026-06-08 while verifying the prod chat fix: a new reply (or an `isError` node) is created and rendered correctly, but the viewport stays put, so on a tall tree the new node lands below the fold and looks like "nothing happened" (sent a message, got a real "Four" reply, but had to scroll to see it). Error handling itself is fine (failed sends flip to the red `isError` node with the backend `detail`). Just center/scroll-into-view the freshly added assistant node when it resolves.

### P1 - SEO follow-ups (from the 2026-06-10 homepage SEO pass — @Jayden)

Context: the homepage SEO is done + live (meta/OG/Twitter/canonical/JSON-LD in `index.html`,
`robots.txt` + `sitemap.xml` + `og-image.png` in `public/`, GSC + Bing both verified, `www`
301s to apex). What's left is in the frontend routing layer, which is your area.

- [ ] ⚠️ **DO NOT remove the two verification meta tags in `index.html` head** —
  `<meta name="google-site-verification" ...>` and `<meta name="msvalidate.01" ...>`. Removing
  either drops our Google / Bing verification. Same for the `og:*`, `twitter:*`, `canonical`,
  `description`, and the JSON-LD `<script>` block — they're all static-head SEO, keep them.
- [ ] **Per-route `<title>` + `<meta name="description">` for `/privacy`, `/terms`, `/app`.**
  Right now every route inherits the homepage title ("BranchChat - Branch, Compare, and Map AI
  Conversations") and description because it's an SPA and only `index.html` is served. Give each
  route its own title/description (React 19 supports rendering `<title>`/`<meta>` straight from a
  component, or use a tiny head effect — no react-helmet needed). Suggested:
  - `/privacy` → "Privacy Policy · BranchChat"
  - `/terms` → "Terms of Service · BranchChat"
  - `/app` → keep it noindex-friendly; it's already `Disallow`ed in robots.txt, but a distinct
    title like "BranchChat App" avoids the canonical homepage title leaking onto the gated app.
  Leave the canonical tag pointing at `https://branch-chat.com/` on the homepage only — if you add
  per-route canonicals later, make each self-referential.
- [ ] **Code-split the main bundle for Core Web Vitals.** Production build warns the entry chunk is
  ~861 kB (278 kB gzip), over Vite's 500 kB threshold. The landing page pulls in the whole app
  (React Flow / `@xyflow/react`, motion, the chat shell) even though `/` only needs the marketing
  page. Lazy-load the `/app` route (`React.lazy` + `Suspense` on the `AppGate`/`AppChat` import in
  `App.tsx`) so React Flow & the chat code split out of the initial load — biggest LCP/INP win for
  the landing page, which is the page that actually gets indexed.

### P1 - Social pipeline UI screenshots (@Jayden's Claude — please action)

Roshaan set up an automated social-media content pipeline. A snapshot is now on
the **`roshaan/social-pipeline`** branch (pushed for your review with `[skip ci]`,
so it does **not** deploy). Get it without disturbing your branch:
`git fetch origin && git worktree add ../social-pipeline-review roshaan/social-pipeline`
(files land in `../social-pipeline-review/social-pipeline/`). The live working
copy still lives locally on Roshaan's machine.
Text/hook posts auto-generate branded cards, but "show the product" posts need
**real UI screenshots**, and a good shot needs a populated canvas — which is your
area. Please capture a small starter set:

- [ ] **Canvas with a real branching conversation** (several nodes, ≥1 visible fork) — the hero shot
- [ ] **Branch-compare view** (two endpoints side by side)
- [ ] **A node with tags/comments or context links**
- [ ] **Zoomed-out full tree** showing the scale of an exploration
- [ ] (optional) replay/history or any feature worth highlighting

Details / naming convention / where they're used: see
`social-pipeline/assets/ui/README.md`. **Drop the PNGs into
`social-pipeline/assets/ui/`** with descriptive filenames (e.g.
`canvas-branching.png`), then **commit + push them back to
`roshaan/social-pipeline`** (keep `[skip ci]` in the message) so Roshaan can pull
them into the pipeline. Light mode preferred (matches the cards); retina/2x if
possible; use believable research content, nothing sensitive. The pipeline
auto-rotates whatever is in that folder; until shots exist it falls back to
generated cards. Tip: the P1 "Load demo conversation" item below would make
capturing these trivial.

### P1 - Tree Layout And Canvas

- [ ] Verify branch creation from collapsed nodes and search navigation into collapsed subtrees.
- [ ] Check that imported JSON sessions normalize node size/position fields consistently.

### P1 - Security follow-ups (from 2026-06-06 audit, non-blocking for single-instance beta)

- [ ] Durable brute-force throttle: count `login_attempts` by IP (or move the limiter to Redis) so the per-IP brake survives restarts/multiple instances. Today: in-memory 10/min + per-account lockout (single-instance only).
- [ ] Pin the Supabase CA and restore `verify-full` for the DB connection (currently `sslmode=require`/`CERT_NONE` — encrypted but unauthenticated; documented).
- [ ] Bump FastAPI so Starlette ≥ 0.47.2 (two DoS CVEs are NOT reachable today — no multipart surface — hygiene only).
- [ ] Rotate any real `GEMINI_API_KEY` that ever sat in a local `.env` (gitignored, not committed, not in image).
- [ ] Optional: per-user `token_version`/`jti` for instant session revocation (JWTs are stateless; ≤60-min expiry limits blast radius today).
- [ ] Set real `ALLOWED_HOSTS` (Host-header validation; default `*` skips `TrustedHostMiddleware`) and confirm `CORS_ORIGINS` in the prod env.

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

- [ ] Add React Testing Library coverage for `Toolbar` search result rendering. (`openNode` dispatch is already unit-tested at the store level; jsdom env + a `UsageMeter` RTL test landed in #10 — this is the remaining component-rendering piece.)
- [ ] Add browser/e2e smoke test: load demo, search phrase, click result, assert node is selected/centered.
- [ ] Add backend contract tests for `/api/chat/gemini`, `/api/chat/summarize`, and `/api/share`.

## Recently Completed

- [x] **Production chat outage fixed (2026-06-09, backend).** Root cause: `DB_USE_PGBOUNCER` was unset behind Supabase's transaction pooler, so asyncpg's prepared-statement cache collided across pooled backends and every DB-backed endpoint (`/api/chat/*`, `/api/auth/usage`) flapped 500s. Fix: set `DB_USE_PGBOUNCER=true` on Railway and redeployed (`backend` commit `c7c8d89`; the disable logic was already present in `app/db/session.py`, just gated on the flag). Verified: `/api/auth/usage` 12/12 = 200; chat returns real Gemini replies; refund-on-5xx and the coding-mode usage bucket confirmed live. Remaining intermittent 502s are Gemini free-tier 503/429 (overloaded/rate-limited), handled gracefully (clean `detail` + quota refund), not a backend bug. Added `DB_USE_PGBOUNCER=true` to the P0 deploy-env checklist and an incident note in `docs/backend-security.md`.
- [x] Auth token routes: `/reset-password` + `/verify-email` pages (read `?token=`, POST it), forgot-password mode in `AuthDialog`, `VerifyEmailBanner` resend for unverified users, 4 `api.ts` helpers. Live-verified end-to-end with real tokens from the dev email log. Merged (#12).
- [x] Merged `roshaan/landing` → `jayden/frontend`: marketing landing page, waitlist, **react-router**, PostHog (consent-gated) analytics, cookie consent, privacy/terms pages. The full chat shell now lives in `AppChat.tsx` under the gated `/app` route; resolved the entry-file restructure against 10 PRs of divergence. Merged (#11). _Deploy follow-ups (Pages production-branch repoint, Supabase `waitlist` table, PostHog key) tracked above — still a human/deploy decision._
- [x] jsdom test env (vitest setupFiles + jest-dom; per-file `// @vitest-environment jsdom`) + store tests (`migratePersistedState`, create/rename/delete invariants, `loadDemoChat`, `openNode`) and a `UsageMeter` RTL test. 28 tests total. Merged (#10).
- [x] Test harness: stood up vitest v4 (`test`/`test:watch` scripts; `npm audit` clean) + 17 unit tests for the pure helpers (`treeLayout`, `searchChats`, `formatRelativeTime`/`cn`). Merged (#9). _Note: the old backlog's "collision avoidance / coding-mode node sizes" layout cases are N/A — the rebuilt `treeLayout` is a plain tidy layout with no collision avoidance. Layout helpers were already a separate module (`src/lib/treeLayout.ts`), so that extraction item is moot too. `migratePersistedState` + component/RTL tests still need a jsdom env (follow-up)._
- [x] Search-result navigation feedback: the opened node briefly pulses a ring (`node-flash` keyframe; Canvas flashes, ChatNode renders the overlay). Merged (#8).
- [x] "Load demo conversation" Toolbar action (pure `src/lib/demoChat.ts` builder: a Kyoto-trip tree splitting into two labeled branches + a continuation). Reachable any time, not just first-run onboarding. Merged (#7).
- [x] Toolbar sidebar: workspace-grouped chat browser + chat management (new/switch/rename/delete-with-confirm; store keeps `activeChatId` always valid). Toggleable from the header. Merged (#5).
- [x] Cross-chat search with result navigation: pure `src/lib/search.ts` (content + branch-label + tag, windowed snippet), `openNode` + `focusNodeRequest` plumbing, Canvas centers the hit. Merged (#6). _Remaining search polish (selected-node pulse/toast, RTL + e2e tests) still in the backlog below._
- [x] Retry button on errored assistant nodes (re-requests the reply via `retryAssistant`). Merged to `jayden/frontend` (#1).
- [x] localStorage persist versioning (`version: 1` + `migrate`; pre-versioning saves pass through as v0, none discarded). Merged (#1).
- [x] `authStore` + header usage meter, driven live by `/api/auth/{me,usage}` (limits read from the backend, never hardcoded; refreshes after each chat round-trip). Merged (#2).
- [x] Modal sign-in / create-account / sign-out (router-free, wired to `authStore`; backend `detail` surfaced on errors). Merged (#4, replacing auto-closed #3).
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
