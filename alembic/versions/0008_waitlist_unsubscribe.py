"""waitlist.unsubscribed_at — marketing-email opt-out

Marketing/announcement emails (e.g. the beta-launch blast) must carry a
working unsubscribe link. This column records when a waitlist contact opted
out; the broadcast query skips any row where it is set. NULL = subscribed.

Idempotent (IF NOT EXISTS), tolerating a schema.sql bootstrap.

Revision ID: 0008_waitlist_unsubscribe
Revises: 0007_sync_title_text
Create Date: 2026-06-11
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0008_waitlist_unsubscribe"
down_revision: str | None = "0007_sync_title_text"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS "
        "unsubscribed_at timestamptz NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE waitlist DROP COLUMN IF EXISTS unsubscribed_at")
