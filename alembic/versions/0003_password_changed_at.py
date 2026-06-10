"""users.password_changed_at — session revocation on password change

Sessions are stateless JWTs, so a stolen cookie used to stay valid for up to
``JWT_EXPIRE_MINUTES`` after the victim reset their password. ``set_password``
now stamps this column and ``deps.current_user`` rejects tokens whose ``iat``
predates it, so a password reset immediately evicts every existing session.

Idempotent (``IF NOT EXISTS``) so it tolerates the column having been applied
via ``supabase/schema.sql`` on a fresh bootstrap.

Revision ID: 0003_password_changed_at
Revises: 0002_waitlist
Create Date: 2026-06-10
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003_password_changed_at"
down_revision: str | None = "0002_waitlist"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at")
