# Branching Chat Backend

Production-ready FastAPI backend for the Branching Chat Interface. Handles tree-based message storage, path reconstruction for context, and multi-agent AI (OpenAI, Gemini).

## Tech Stack

- Python 3.11+
- FastAPI, Uvicorn
- PostgreSQL, SQLAlchemy (async), Alembic
- Pydantic v2, python-dotenv
- OpenAI Python SDK, Google Generative AI (Gemini)

## Setup

1. **Create virtualenv and install**

   ```bash
   python3.11 -m venv .venv
   source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows
   pip install -r requirements.txt
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set:

   - `DATABASE_URL` – PostgreSQL URL with async driver, e.g.  
     `postgresql+asyncpg://user:password@localhost:5432/branchwise_chat`
   - `OPENAI_API_KEY` – for default/OpenAI agent
- `GOOGLE_GEMINI_API_KEY` – optional, for Gemini agent
- `CORS_ORIGINS` – allowed frontend origins (comma-separated)
- `RESEND_API_KEY` – optional, for verification and password reset emails
- `RESEND_FROM_EMAIL` – verified sender identity in Resend
- `APP_BASE_URL` – frontend origin used in verification/reset links

3. **Database**

   ```bash
   # From project root (branchwise-chat)
   alembic upgrade head
   ```

4. **Run**

   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   API: `http://localhost:8000`  
   Docs: `http://localhost:8000/docs`

## Local Ollama (Free)

Use local generation without cloud APIs:

```bash
# Install Ollama, then pull the default model
ollama pull llama3.1:8b

# Start API
py -m uvicorn app.main:app --reload

# Start frontend from repo root in another terminal
npm run dev
```

Environment defaults:

- `OLLAMA_URL=http://localhost:11434`
- `OLLAMA_MODEL=llama3.1:8b`

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversation/start` | Create root conversation |
| GET | `/api/conversation/{root_id}` | Get full tree (flat list) |
| POST | `/api/chat` | Send message / continue branch (body: `node_id`, `user_input`, `focus_text?`, `agent?`) |
| POST | `/api/chat/stream` | Same as above, SSE stream |
| GET | `/api/chat/agents` | List supported agents (openai, gemini) |
| DELETE | `/api/node/{node_id}` | Delete node and all descendants |

## Changing the AI Agent

Use the `agent` field in `POST /api/chat` (or `/api/chat/stream`):

- `openai` (default) – uses `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-4o-mini`)
- `gemini` – uses `GOOGLE_GEMINI_API_KEY` and `GEMINI_MODEL` (default `gemini-1.5-flash`)

Example:

```json
{
  "node_id": "uuid-of-selected-node",
  "user_input": "Explain this in one sentence.",
  "agent": "gemini"
}
```

## Project Layout

```
app/
  main.py           # FastAPI app, CORS, rate limit, logging
  core/
    config.py       # Settings from env
    security.py     # Rate limit, UUID validation
  db/
    base.py         # SQLAlchemy Base
    session.py     # Async session, get_db
  models/
    message.py      # Message tree model
  schemas/
    message.py      # Pydantic request/response
  services/
    tree_service.py # get_path_to_root, get_conversation_tree_flat, delete_branch
    chat_service.py # path_to_openai_messages, get_completion, get_completion_stream
  routers/
    conversation.py # start, get tree
    chat.py         # chat, stream, list agents
    node.py         # delete branch
alembic/            # Migrations (script_location in alembic.ini)
```

## Security

> **Full reference:** [`docs/backend-security.md`](docs/backend-security.md) — threat
> model, OWASP checklist → code map, and the 2026-06-06 pre-beta audit (verdict:
> production-safe with the hardening below). Pre-beta audit summary lives in `todo.md`.

Current posture (verified by the audit):

- **Secrets** are read from the server environment only, never sent to the frontend.
  **Production refuses to boot** with the default/weak `JWT_SECRET_KEY` or
  `ANON_IDENTITY_SALT` (fail-closed startup guard) so a misconfigured deploy can't
  sign forgeable session tokens.
- **Database is RLS-first.** The app connects as a least-privilege `app_user` role
  (`NOBYPASSRLS`); ownership is enforced per-transaction via the `app.user_id` GUC
  (`rls_tx`), so a missed app-level check still can't leak another user's rows. All
  SQL is parameterized (zero string-built SQL).
- **Auth:** argon2id hashing, short-lived HS256 JWT in an `HttpOnly`+`Secure`+
  `SameSite` cookie (cleared with matching attributes), `exp`+`sub` required on decode,
  per-account lockout (5 → 15 min), enumeration-safe + timing-equalised responses,
  single-use SHA-256-hashed email/reset tokens.
- **Rate limiting** is layered (global per-IP, AI per-IP, auth per-IP) — in-process
  today (single instance); Redis-ready via the `RateLimiter` protocol before scaling.
- **DoS:** request body-size cap → 413 before parsing; server-side history/quota caps.
- **Headers / CSRF:** nosniff, frame-deny, strict CSP, Referrer/Permissions-Policy,
  HSTS (prod); cross-origin writes rejected by an Origin allow-list; CORS is an explicit
  allow-list with credentials (never `*`).
- **Supply chain:** non-root container, `.dockerignore` keeps `.env` out of images,
  `npm audit` clean, backend pins CVE-clean for the reachable surface.

> ⚠️ **The Tech Stack / API Overview / "Changing the AI Agent" sections above are
> stale** (they describe an older OpenAI-default, server-stored conversation-tree
> design). The live backend is the **stateless, Gemini-first** service documented in
> [`architecture.md`](architecture.md) and `docs/backend-security.md`. Rewriting those
> sections is tracked under P2 in `todo.md`.

## Email Auth Flows

When `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured, the backend supports:

- `POST /api/auth/send-verification-email`
- `POST /api/auth/verify-email`
- `POST /api/auth/request-password-reset`
- `POST /api/auth/reset-password`

`APP_BASE_URL` should point at your frontend so the emails link to `/verify-email` and `/reset-password`.

## Release And Rollback

Before shipping a risky backend change, review [`docs/launch-rollback-playbook.md`](docs/launch-rollback-playbook.md) and [`docs/release-checklist.md`](docs/release-checklist.md). They include the current production message limit target of `50`, Postgres backup/restore commands, and the health check workflow used by this repo.
