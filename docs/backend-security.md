# Backend security & data model

How the FastAPI backend addresses the hardening checklist. This is the reference
for the threat-model decisions baked into `app/`.

## Database access model (RLS-first, Supabase-ready)

The single most important decision: **the app connects as a least-privilege role
(`app_user`) that does not bypass RLS.** Postgres superusers bypass row-level
security entirely, so connecting as `postgres` would silently void every policy.

- **Two connections.** The app uses `DATABASE_URL` (role `app_user`). Alembic
  uses `DATABASE_DIRECT_URL` (admin/`postgres`) for DDL, `CREATE POLICY`,
  extensions, and GRANTs.
- **RLS on every table.** On Supabase, any table without RLS is exposed through
  the auto-generated REST API to the `anon` key — a public data leak. We
  `ENABLE ROW LEVEL SECURITY` on all tables and `REVOKE` from `anon`/
  `authenticated`, so the data API denies by default.
- **Real per-row enforcement where it matters.** `share_snapshots` (the only
  user-owned table) `FORCE`s RLS and carries an ownership policy:
  `owner_user_id = current_setting('app.user_id')`. The GUC is set per
  transaction from the cookie-JWT identity via `rls_tx(session, user_id)` — so a
  missed app-level ownership check still can't leak another user's rows (IDOR
  defence in depth). This is portable: it works identically on Docker Postgres
  and Supabase and does **not** depend on Supabase Auth's `auth.uid()`.
- **Pooling.** Bounded SQLAlchemy pool (`DB_POOL_SIZE` + `DB_MAX_OVERFLOW` →
  10–20 connections) with `pool_pre_ping`. Behind Supabase's transaction pooler
  (Supavisor) / PgBouncer, set `DB_USE_PGBOUNCER=true` to disable asyncpg
  prepared statements (unsafe across pooled server connections).

## OWASP / hardening checklist → where it lives

| Concern | Where |
| --- | --- |
| SQL injection | SQLAlchemy ORM + bound params everywhere; zero string-built SQL. Pydantic validates all input (`app/schemas`). |
| RLS missing policies | `alembic/versions/0001_initial.py` — RLS enabled on every table, ownership policy on `share_snapshots`. |
| Broken access control / IDOR | App-level ownership checks **plus** RLS GUC (`app/db/session.py:rls_tx`). |
| Brute force (5× wrong password) | **Enforced today:** per-account lockout (`users.failed_login_count` / `locked_until`, 5 → 15 min) **and** per-IP in-memory `auth_rate_limit` (10/min on every auth route). The `login_attempts` table is *recorded* for audit but **not yet counted** for a durable cross-restart throttle — see Audit follow-ups. |
| Account-existence leaks | Login/reset return uniform messages; password reset always 200; unknown-user login still runs a dummy hash to equalise timing. |
| Malformed signup | Pydantic strict validation, `email-validator`, password policy → 422. |
| Expired session | Short-lived JWT in HttpOnly cookie → 401; `decode_token` requires `exp`+`sub`; `/api/auth/*` responses are `no-store`. |
| Rate limiting | Layered: global per-IP middleware, AI per-IP, auth per-IP (`app/core/rate_limit.py`); Redis-ready via the `RateLimiter` protocol. **In-process today** — correct for a single instance; move to Redis before horizontal scaling. |
| Request-size DoS | `BodySizeLimitMiddleware` rejects bodies > `MAX_REQUEST_BODY_BYTES` (5 MB) with 413 before JSON parsing (`app/main.py`). |
| Security headers | `app/core/security_headers.py` — nosniff, frame-deny, CSP `default-src 'none'`, Referrer-Policy, Permissions-Policy, HSTS (prod). |
| Auth flaws (CSRF, cookies) | `OriginCheckMiddleware` rejects cross-origin writes; cookies `HttpOnly`+`Secure`+`SameSite` (set and cleared with matching attributes); argon2id password hashing. |
| Secret leakage | Keys only in backend env (`app/core/config.py`); **prod refuses to boot with default/weak `JWT_SECRET_KEY`/`ANON_IDENTITY_SALT`**; Gemini key sent as a header, never in a URL; error responses are generic (`app/main.py`); `.dockerignore` keeps `.env` out of images; container runs non-root. |

## Performance / efficiency

| Ask | Implementation |
| --- | --- |
| Indexes on filtered/sorted columns | Migration `0001` indexes `users.email`, `email_tokens.token_hash`/`user_id`/`expires_at`, `usage_counters (identity_hash, day, kind)`, `share_snapshots.token` + `(owner_user_id, created_at)`, `login_attempts (identifier, scope, created_at)`. |
| No loops over the DB | Atomic upsert for quota (`usage_service`); list endpoints will use single JOIN/`selectinload` queries (no N+1). |
| Pagination on every list endpoint | Keyset (cursor) pagination helper to be shared by `share`/`analytics` list routes. |
| pg-pool 10–20 | `app/db/session.py` engine config. |
| No `SELECT *` | Pydantic response models expose only needed fields; queries select explicit columns / `load_only`. |

## Analytics (PostHog)

`app/services/analytics.py` is server-side, fail-open, and a no-op until
`POSTHOG_API_KEY` is set. Event taxonomy: `user_signed_up`, `email_verified`,
`first_message_sent` (activation / first meaningful action), `message_sent`,
`branch_created`, `share_created`. On signup we `alias` the anon id → user id so
pre-signup activity attributes to the account. D1/D7 retention is computed in
PostHog from these events plus the `signup_date` person property.

## Security audit — 2026-06-06

A full pre-beta audit was run across four independent tracks: (1) auth /
session / access control, (2) injection / RLS / secrets, (3) config / rate
limiting / headers / DoS, (4) frontend / dependency supply chain.

**Verdict: production-safe with the fixes below applied.** The crypto, RLS,
injection defences, CORS, CSRF, security headers, X-Forwarded-For handling,
server-side quotas, and dependency pins were all verified sound. `npm audit` is
clean (0 advisories); backend pins are CVE-clean for the reachable surface.

### Fixed this pass (commit `ccddea3`)
- **CRITICAL — prod refuses to boot on default secrets.** `Settings` now hard-
  fails at startup when `ENV=production` and `JWT_SECRET_KEY`/`ANON_IDENTITY_SALT`
  are unset, the dev default, or too short. Closes the silent "forgeable JWT"
  path. (`app/core/config.py`, `tests/test_config.py`.)
- **MEDIUM — request body-size cap.** `BodySizeLimitMiddleware` → 413 over 5 MB
  before parsing (large-payload DoS). (`app/main.py`, `tests/test_body_limit.py`.)
- **MEDIUM — cookie clears with matching attributes** (`secure`/`httponly`/
  `samesite`) so logout reliably drops the session. (`app/routers/auth.py`.)
- **LOW — JWT decode requires `exp`+`sub`** (defence in depth). (`app/core/security.py`.)
- **LOW — container runs non-root + `.dockerignore`** so `.env` can't be baked
  into an image. (`Dockerfile`, `.dockerignore`.)

### Residual follow-ups (not blocking single-instance beta, in priority order)
1. **Durable brute-force throttle.** Count `login_attempts` (or move the limiter
   to Redis) so the per-IP brake survives restarts / multiple instances. Today's
   active controls (in-memory 10/min + per-account lockout) are adequate for a
   single instance only.
2. **Redis-backed rate limiter** before horizontal scaling — the in-process
   limiter's budget multiplies per worker/instance. Pin to **one worker** until
   then (the Docker `CMD` already runs a single uvicorn process).
3. **Pin the Supabase CA** and restore `verify-full`. DB TLS is currently
   `sslmode=require` (encrypted but unauthenticated, `CERT_NONE`) for Supabase's
   private-CA pooler — documented/accepted, but the weakest link in the data path.
4. **Bump FastAPI** so Starlette ≥ 0.47.2. Two Starlette DoS CVEs are **not
   reachable** today (no multipart surface; `python-multipart` not installed) —
   hygiene only.
5. **Rotate any real `GEMINI_API_KEY`** that lived in a local `.env` (it is
   gitignored, not committed, and not in the image — low urgency).
6. **Session revocation.** JWTs are stateless; a leaked token is valid until
   `exp` (≤ 60 min). Add a per-user `token_version`/`jti` denylist if instant
   logout-all / reset-invalidates-sessions is required.
7. **Tighten host/CORS in prod env.** Set `ALLOWED_HOSTS` to the real API host(s)
   (enables Host-header validation; default `*` skips `TrustedHostMiddleware`)
   and `CORS_ORIGINS` to the real frontend origins.

### Required production environment (the boot guard enforces the starred ones)
`ENV=production`, `JWT_SECRET_KEY`★ (≥32 random), `ANON_IDENTITY_SALT`★ (≥16
random), `COOKIE_SECURE=true`, `COOKIE_SAMESITE`, `CORS_ORIGINS=https://branch-chat.com,https://www.branch-chat.com`,
`ALLOWED_HOSTS=<api host>`, `DATABASE_URL` (the `app_user` pooler URL),
`DB_USE_PGBOUNCER=true`, `DB_SSL=true`, `GEMINI_API_KEY`, `APP_BASE_URL`,
`ENABLE_LEGACY_TREE_API=false`. **A failed deploy after this change means one of
the starred secrets is missing/weak in the platform env — that is the guard
working, not a regression.**

## Status

Built + verified against live Postgres/Gemini:

* Foundation + `/api/chat/{gemini,ollama}` (stateless, anon quota + network
  bucket, Gemini fallback). RLS ownership isolation proven against the `app_user`
  role. Real Gemini call returns end-to-end over HTTP.
* **Auth**: signup / login / logout / me / usage, password reset, email
  verification, resend. argon2id, JWT cookie, 5×-failure lockout, single-use
  hashed tokens, enumeration-safe responses, timing-equalised login. 12 DB-backed
  regression tests cover the edge cases above.

Next milestones: **share snapshots** (public SECURITY DEFINER read path) and
**analytics events** beyond signup/login/verify (activation/retention dashboards).
