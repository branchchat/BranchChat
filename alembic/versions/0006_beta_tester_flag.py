"""users.is_beta_tester — account-gated private beta

Replaces the shared client-side passphrase: chat endpoints now require a
signed-in account with this flag, granted manually via /api/admin/beta.
Anonymous and unapproved traffic can no longer spend provider tokens.

Idempotent (IF NOT EXISTS) like 0003, tolerating a schema.sql bootstrap.

Revision ID: 0006_beta_tester_flag
Revises: 0005_synced_chats
Create Date: 2026-06-10
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0006_beta_tester_flag"
down_revision: str | None = "0005_synced_chats"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "is_beta_tester boolean NOT NULL DEFAULT false"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_beta_tester")
