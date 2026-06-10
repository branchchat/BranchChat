"""index login_attempts.created_at for retention sweeps

The durable IP throttle reads recent rows via the (identifier, scope,
created_at) index; the retention sweep (auth_service._prune_stale_attempts)
deletes by bare created_at, which needs its own index to stay a cheap ranged
delete as the table grows. Idempotent, mirroring 0003.

Revision ID: 0004_login_attempts_retention
Revises: 0003_password_changed_at
Create Date: 2026-06-10
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004_login_attempts_retention"
down_revision: str | None = "0003_password_changed_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_login_attempts_created "
        "ON login_attempts (created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_login_attempts_created")
