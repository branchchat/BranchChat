"""synced_chats.deleted_at — server-side delete tombstones

Client-side tombstones fixed delete-resurrection for the deleting device, but
a second device offline during the delete still re-pushed the chat. Deletes
are now soft: the row stays as a tombstone (payload/title cleared) so the
manifest can broadcast the deletion to every device, and a stale re-push is
rejected. A strictly newer push resurrects (LWW, consistent with the rest of
sync).

Idempotent (IF NOT EXISTS), tolerating a schema.sql bootstrap.

Revision ID: 0010_sync_tombstones
Revises: 0009_feedback
Create Date: 2026-06-11
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0010_sync_tombstones"
down_revision: str | None = "0009_feedback"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE synced_chats ADD COLUMN IF NOT EXISTS "
        "deleted_at timestamptz NULL"
    )


def downgrade() -> None:
    # Tombstone rows become unreachable live rows with empty payloads; purge
    # them rather than resurrect empty chats.
    op.execute("DELETE FROM synced_chats WHERE deleted_at IS NOT NULL")
    op.execute("ALTER TABLE synced_chats DROP COLUMN IF EXISTS deleted_at")
