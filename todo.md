# BranchChat Todo

This file is for Claude/human coordination after the handoff. Keep it current when starting or finishing work, especially because two separate Claude Max accounts may work on this repo.

## Coordination Rules

- Work on separate branches unless explicitly pairing on the same change.
- Before starting: `git status -sb`, `git pull --ff-only`, and add a short note under "Active Work".
- Before pushing: run relevant checks, update this file if the todo state changed, and push a focused commit.
- Avoid rewriting `main` history. Do not force-push unless the human explicitly asks.
- If both accounts touch the same high-risk files (`chatStore.ts`, `Canvas.tsx`, `Toolbar.tsx`, backend auth/rate limit files), coordinate through this todo first.

## Active Work

- **Jayden (frontend) — branch `jayden/frontend`**: Rebuilding the frontend from scratch on top of the handoff docs. Done so far: Vite + React + TS + Tailwind + shadcn/ui scaffold, and Milestone 2 "data core" — `src/types/chat.ts` (`ChatNode`, `ChatSessionState`) and `src/store/chatStore.ts` (Zustand persisted to `branchchat-storage`, one chat with a root system node, `selectNode` + placeholder `addNode`). No canvas/UI or AI calls yet. Next: canvas + node UI milestones. Owning `src/store/chatStore.ts` and `src/types/chat.ts` for now — coordinate here before touching them.

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
