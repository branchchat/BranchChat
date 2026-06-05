# CLAUDE.md

This repo is being handed off to Claude. Read this first, then `README.md`, `architecture.md`, `todo.md`, and `README_BACKEND.md`.

## Mission

BranchChat is a visual branching chat application. Users explore conversations as node trees on an infinite canvas, branch from earlier messages, compare paths, link cross-branch context, tag/comment nodes, and share read-only branch snapshots.

The normal product is local-first: the active conversation tree lives in the browser via Zustand/localStorage. The backend handles AI calls, auth, usage limits, share links, analytics, and legacy optional DB-tree APIs.

## Human Context

The project is moving from Codex to Claude, and work may happen from two separate Claude Max accounts. Treat `todo.md` as the shared coordination scratchpad. Do not assume the other account's local changes are yours. Pull before starting and check the worktree before editing.

## Working Rules

- Start every task with `git status -sb`.
- Prefer narrow, codebase-consistent changes over broad refactors.
- Never overwrite or revert changes you did not make unless the human explicitly asks.
- Keep secrets out of code and docs. `.env` exists locally but must not be committed.
- Use explicit file staging. Avoid `git add -A` if unrelated files are present.
- Do not force-push or rewrite `main`.
- For UI changes, run at least `npm.cmd test` and `npm.cmd run build`.
- For backend changes, run `.\.venv\Scripts\python.exe -m unittest discover tests` or a narrower relevant test if time is tight.
- If changing canvas behavior, verify in a browser when practical.

## Current Branch State At Handoff

- Main branch is expected to be clean and aligned with `origin/main`.
- Latest pushed commit from Codex: `551bf2f Improve search result node navigation`.
- Recent fixes already on `main`:
  - Gemini fallback/504 hardening.
  - Collision-aware branch node placement.
  - Login/auth rate-limit false positive fix.
  - Search result snippets and exact node navigation.

## High-Value Files

Frontend:

- `src/store/chatStore.ts`: central application behavior. Large file; change carefully.
- `src/components/Canvas.tsx`: React Flow graph, focus/fit behavior, replay, controls.
- `src/components/ChatNode.tsx`: node UI and node-level actions.
- `src/components/Toolbar.tsx`: workspace browser, chat management, search.
- `src/components/InputBar.tsx`: composer.
- `src/types/chat.ts`: core chat/session types.
- `src/store/authStore.ts`: auth and usage state.

Backend:

- `app/main.py`: middleware, app setup, CORS, rate limits, startup.
- `app/routers/chat.py`: AI routes and summarization.
- `app/services/gemini_service.py`: Gemini prompt/provider logic.
- `app/services/usage_service.py`: daily quota logic.
- `app/routers/auth.py` and `app/services/auth_service.py`: login, cookies, email auth, failed login limiter.
- `app/routers/share.py` and `app/services/share_service.py`: shared branch snapshots.
- `app/core/config.py`: settings/env defaults.

## Architecture Reminders

- Do not assume backend DB stores the live visual tree.
- `parentId`/`childrenIds` define the conversation tree.
- `contextNodeIds` are supplemental cross-branch links, not tree edges.
- `activePath` must match the selected node path to root.
- Search result navigation uses `openNode(chatId, nodeId)` and a `focusNodeRequest` consumed by `Canvas.tsx`.
- Branch placement uses exported `__testNextChildPosition` for layout tests.
- Route-level auth limits still exist; the broad duplicate `/api/auth/*` middleware bucket was intentionally removed.

## Common Commands

```powershell
git status -sb
git pull --ff-only

npm.cmd test
npm.cmd run build
npm.cmd run lint
npm.cmd run dev -- --host 127.0.0.1 --port 5173

.\.venv\Scripts\python.exe -m unittest discover tests
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Known lint state: lint currently passes with existing fast-refresh warnings in shadcn/ui component files.

## Suggested First Tasks

See `todo.md`. The most likely useful next improvement is adding an always-available "Load demo conversation" action for existing users, since currently it is mainly exposed through first-run onboarding.

## Git Handoff Protocol For Two Claude Accounts

1. Pull latest `main`.
2. Create or switch to a focused branch for anything non-trivial.
3. Add a short note in `todo.md` under "Active Work" if work will continue across sessions.
4. Commit focused changes with a clear message.
5. Push and tell the human exactly what changed and what was tested.
6. If staying on `main` by human request, still inspect scope before staging.
