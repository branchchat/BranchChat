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
| Brute force (5× wrong password) | Per-account lockout (`users.failed_login_count` / `locked_until`) + per-IP `login_attempts` throttle + `auth_rate_limit`. *(wired in the auth milestone — schema is in place.)* |
| Account-existence leaks | Login/reset return uniform messages; password reset always 200; unknown-user login still runs a dummy hash to equalise timing. *(auth milestone.)* |
| Malformed signup | Pydantic strict validation, `email-validator`, password policy → 422. |
| Expired session | Short-lived JWT in HttpOnly cookie → 401; `/api/auth/*` responses are `no-store`. |
| Rate limiting | Layered: global per-IP middleware, AI per-IP, auth per-IP (`app/core/rate_limit.py`); Redis-ready via the `RateLimiter` protocol. |
| Security headers | `app/core/security_headers.py` — nosniff, frame-deny, CSP `default-src 'none'`, Referrer-Policy, Permissions-Policy, HSTS (prod). |
| Auth flaws (CSRF, cookies) | `OriginCheckMiddleware` rejects cross-origin writes; cookies `HttpOnly`+`Secure`+`SameSite`; argon2id password hashing. |
| Secret leakage | Keys only in backend env (`app/core/config.py`); Gemini key sent as a header, never in a URL; error responses are generic (`app/main.py`). |

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
