# BranchChat Todo

This file is for Claude/human coordination after the handoff. Keep it current when starting or finishing work, especially because two separate Claude Max accounts may work on this repo.

## Coordination Rules

- Work on separate branches unless explicitly pairing on the same change.
- Before starting: `git status -sb`, `git pull --ff-only`, and add a short note under "Active Work".
- Before pushing: run relevant checks, update this file if the todo state changed, and push a focused commit.
- Avoid rewriting `main` history. Do not force-push unless the human explicitly asks.
- If both accounts touch the same high-risk files (`chatStore.ts`, `Canvas.tsx`, `Toolbar.tsx`, backend auth/rate limit files), coordinate through this todo first.

## Active Work

- **Roshaan (backend) — branch `backend`**: Scaffolding the FastAPI backend (`app/`) from scratch off `main`. Done so far:
  - Foundation: `app/core/config.py` (Pydantic settings), `app/db/session.py` (async engine, 10–20 pool, pooler-aware for Supabase, `rls_tx` GUC helper), security headers + CSRF origin-check middleware, layered rate limiter (Redis-ready interface).
  - Data model + migration `0001_initial`: `users`, `email_tokens`, `usage_counters`, `share_snapshots`, `login_attempts`, with indexes on every filtered/sorted column and **RLS enabled on all tables** (deny-by-default for Supabase's API; ownership policy + FORCE on `share_snapshots`). App connects as least-privilege `app_user` role (docker init creates it).
  - **`POST /api/chat/gemini` + `/api/chat/ollama`** — stateless, matches the frontend contract `{ node_id, message, history, linked_context, coding_mode, personalization } → { node_id, reply }`, errors as `{ detail }` (429 on quota). Gemini model fallback on timeout/5xx/429. Anonymous daily quota + network bucket; per-mode history/message truncation re-applied server-side.
  - PostHog analytics wrapper (no-op until keyed), `/health` + `/health/ready`, Dockerfile, `docker-compose.yml` (local Postgres), Alembic (async), `.env.backend.example`, `docs/backend-security.md`, tests (17 passing: health/headers, prompt truncation, identity, guardrails, chat contract).
  - **Verified:** syntax, import, all 17 tests. **Not yet verified live:** migration + RLS against Postgres (needs Docker Desktop running) and a real Gemini call (needs `GEMINI_API_KEY`).
  - **Auth milestone done + verified live** (commit pending): `app/routers/auth.py` — `POST /api/auth/{signup,login,logout,request-password-reset,reset-password,verify-email,resend-verification}`, `GET /api/auth/{me,usage}`. argon2id hashing, JWT in HttpOnly cookie, 5×-failure account lockout, single-use SHA-256-hashed email tokens, enumeration-safe responses (uniform 401 / generic signup+reset), timing-equalised login. PostHog events: user_signed_up (+ anon→user alias), user_logged_in, email_verified. Verified end-to-end against Docker Postgres + real Gemini: migration applied, **RLS ownership isolation proven**, real chat call returns over HTTP, 30 tests passing (incl. 12 auth edge-case + 1 quota, DB-backed). Fixed a `usage_counters.day` date-binding bug found only by the live run.
  - **@partner (Jayden):** contract matches your `src/lib/api.ts` exactly — don't change it. I need your exact frontend origins for `CORS_ORIGINS`. Base URL is `http://localhost:8000`. Note: **signup does NOT auto-login** (enumeration-safe) — after signup, call `POST /api/auth/login` with the same creds. Auth cookie is `branchchat_token` (HttpOnly); send `credentials: 'include'` (you already do). Next: share snapshots, then analytics/retention. Owning `app/`, `alembic/`, `docker-compose.yml`, `Dockerfile`, root `requirements*.txt` — coordinate here before touching them.

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
