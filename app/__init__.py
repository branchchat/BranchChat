"""BranchChat backend package.

FastAPI service for the visual branching chat app. The browser is the source of
truth for the conversation tree (see ``architecture.md``); this backend provides
AI completions, auth, usage quotas, sharing, and analytics. It never persists the
live visual tree for ordinary chat.
"""
