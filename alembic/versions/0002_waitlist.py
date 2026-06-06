"""waitlist table for early-access signups

Revision ID: 0002_waitlist
Revises: 0001_initial
Create Date: 2026-06-06
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_waitlist"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "waitlist",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("source", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("uq_waitlist_email", "waitlist", ["email"], unique=True)

    # Backend role privileges (guarded so it also runs where app_user is absent).
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist TO app_user;
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
            REVOKE ALL ON waitlist FROM anon;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON waitlist FROM authenticated;
          END IF;
        END
        $$;
        """
    )
    op.execute("ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS waitlist_service ON waitlist")
    op.execute(
        "CREATE POLICY waitlist_service ON waitlist "
        "TO app_user USING (true) WITH CHECK (true)"
    )


def downgrade() -> None:
    op.drop_table("waitlist")
