"""synced_chats — optional server-side sync of chat trees for signed-in users

One row per (user, chat): the frontend's versioned export envelope stored as
an opaque JSONB blob, last-write-wins on the chat's own ``updatedAt`` ms
timestamp. Owner-scoped with FORCED RLS like ``share_snapshots``.

Revision ID: 0005_synced_chats
Revises: 0004_login_attempts_retention
Create Date: 2026-06-10
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_synced_chats"
down_revision: str | None = "0004_login_attempts_retention"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "synced_chats",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("chat_id", sa.String(64), primary_key=True),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("client_updated_at", sa.BigInteger(), nullable=False),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # Backend role privileges (guarded so it also runs where app_user is absent).
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON synced_chats TO app_user;
          END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE ALL ON synced_chats FROM anon;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON synced_chats FROM authenticated;
          END IF;
        END
        $$;
        """
    )

    # Owner-scoped, forced even for the table owner (same shape as share_snapshots).
    op.execute("ALTER TABLE synced_chats ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE synced_chats FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS synced_chats_owner ON synced_chats")
    op.execute(
        """
        CREATE POLICY synced_chats_owner ON synced_chats
          TO app_user
          USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
          WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
        """
    )


def downgrade() -> None:
    op.drop_table("synced_chats")
