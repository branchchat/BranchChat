"""feedback — beta feedback routed to our own backend

The in-app feedback widget posted to PostHog, so notes were lost whenever a
tester declined analytics. This table receives feedback server-side instead
(always captured), tied to the submitting account. Service-scoped RLS like
``waitlist``: the app inserts under the user's context, founders read under
the admin (null) context.

Revision ID: 0009_feedback
Revises: 0008_waitlist_unsubscribe
Create Date: 2026-06-11
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_feedback"
down_revision: str | None = "0008_waitlist_unsubscribe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("path", sa.String(200), nullable=True),
        sa.Column("chat_title", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_feedback_created_at", "feedback", ["created_at"])

    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            GRANT SELECT, INSERT ON feedback TO app_user;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE ALL ON feedback FROM anon;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON feedback FROM authenticated;
          END IF;
        END
        $$;
        """
    )

    # Service-scoped (same shape as waitlist): the app inserts under any
    # context, founders read all rows under the admin (null) context. There is
    # no user-facing read endpoint, so a per-row owner policy isn't needed.
    op.execute("ALTER TABLE feedback ENABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS feedback_service ON feedback")
    op.execute(
        "CREATE POLICY feedback_service ON feedback "
        "TO app_user USING (true) WITH CHECK (true)"
    )


def downgrade() -> None:
    op.drop_table("feedback")
