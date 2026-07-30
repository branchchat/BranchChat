"""user_api_keys — BYOK provider keys, sealed at rest

Users can store their own Gemini/OpenAI/Anthropic API key; replies generated
with it spend their provider account instead of ours, so those messages skip
the daily quota. Keys are sealed with ``sync_crypto.seal_text`` (AES-256-GCM
under the deploy-env key) — the DB never holds a usable key, and the API only
ever returns the last-four hint.

Owner-scoped RLS exactly like ``synced_chats``: forced, and every operation
must match ``current_setting('app.user_id')``.

Revision ID: 0011_user_api_keys
Revises: 0010_sync_tombstones
Create Date: 2026-07-30
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011_user_api_keys"
down_revision: str | None = "0010_sync_tombstones"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_api_keys",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("provider", sa.String(32), primary_key=True),
        sa.Column("sealed_key", sa.Text(), nullable=False),
        sa.Column("key_hint", sa.String(8), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON user_api_keys TO app_user;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE ALL ON user_api_keys FROM anon;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON user_api_keys FROM authenticated;
          END IF;
        END
        $$;
        """
    )

    op.execute("ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE user_api_keys FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS user_api_keys_owner ON user_api_keys")
    op.execute(
        """
        CREATE POLICY user_api_keys_owner ON user_api_keys
          TO app_user
          USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
          WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
        """
    )


def downgrade() -> None:
    op.drop_table("user_api_keys")
