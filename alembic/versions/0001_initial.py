"""initial schema: users, email_tokens, usage_counters, share_snapshots, login_attempts

Creates the full schema with indexes on every column we filter/sort by, then
locks it down with row-level security:

* RLS is ENABLED on every table so that on Supabase the auto-generated REST API
  (anon/authenticated roles) gets NO access by default — an un-RLS'd table there
  is a public data leak.
* ``share_snapshots`` (the one owner-scoped table) additionally FORCES RLS and
  carries an ownership policy keyed to ``current_setting('app.user_id')`` —
  genuine per-row defence in depth against IDOR bugs in app code. The public
  share-by-token read is a separate SECURITY DEFINER path added with the share
  feature.
* Service tables (users/email_tokens/usage_counters/login_attempts) are accessed
  only by the trusted backend ``app_user`` role; their policies admit that role
  and nothing else. Fine-grained auth-table policies arrive with the auth
  milestone.

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-05
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID_PK = dict(server_default=sa.text("gen_random_uuid()"))

# Tables accessed only by the trusted backend role; broad policy for app_user.
_SERVICE_TABLES = ("users", "email_tokens", "usage_counters", "login_attempts")


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    # The app role must exist before we can GRANT to it / target it in policies.
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            RAISE EXCEPTION 'role "app_user" must exist before migrating '
              '(docker init creates it; on Supabase create it first)';
          END IF;
        END
        $$;
        """
    )

    # -- tables -------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, **_UUID_PK),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "email_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "failed_login_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("uq_users_email", "users", ["email"], unique=True)

    op.create_table(
        "email_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, **_UUID_PK),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("purpose", sa.String(16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("uq_email_tokens_hash", "email_tokens", ["token_hash"], unique=True)
    op.create_index("ix_email_tokens_user", "email_tokens", ["user_id"])
    op.create_index("ix_email_tokens_expires", "email_tokens", ["expires_at"])

    op.create_table(
        "usage_counters",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, **_UUID_PK),
        sa.Column("identity_hash", sa.String(64), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "identity_hash", "day", "kind", name="uq_usage_identity_day_kind"
        ),
    )

    op.create_table(
        "share_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, **_UUID_PK),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column(
            "owner_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("uq_share_token", "share_snapshots", ["token"], unique=True)
    op.create_index(
        "ix_share_owner_created", "share_snapshots", ["owner_user_id", "created_at"]
    )

    op.create_table(
        "login_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, **_UUID_PK),
        sa.Column("identifier", sa.String(64), nullable=False),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_login_attempts_lookup",
        "login_attempts",
        ["identifier", "scope", "created_at"],
    )

    # -- privileges ---------------------------------------------------------
    # Lock out Supabase's public API roles (no-op if those roles don't exist),
    # then grant exactly what the backend role needs.
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
          END IF;
        END
        $$;
        """
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user"
    )

    # -- row-level security -------------------------------------------------
    for table in _SERVICE_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY {table}_service ON {table} "
            f"TO app_user USING (true) WITH CHECK (true)"
        )

    # share_snapshots: real ownership enforcement, forced even for the table owner.
    op.execute("ALTER TABLE share_snapshots ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE share_snapshots FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY share_owner ON share_snapshots
          TO app_user
          USING (owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid)
          WITH CHECK (owner_user_id = nullif(current_setting('app.user_id', true), '')::uuid)
        """
    )


def downgrade() -> None:
    op.drop_table("login_attempts")
    op.drop_table("share_snapshots")
    op.drop_table("usage_counters")
    op.drop_table("email_tokens")
    op.drop_table("users")
    # Leave the citext extension in place; other schemas may rely on it.
