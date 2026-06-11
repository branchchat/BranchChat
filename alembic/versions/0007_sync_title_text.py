"""synced_chats.title: varchar(200) -> text — sealed titles

Chat titles are now encrypted at rest like the payloads (the title was the
last plaintext conversation data visible in the table). A sealed title is
"enc1:<b64 nonce>:<b64 ciphertext>", which can exceed 200 chars for long or
multibyte titles, so the column loses its length cap. The API-level cap on
incoming titles (schemas/sync.py, 200 chars) is unchanged.

Revision ID: 0007_sync_title_text
Revises: 0006_beta_tester_flag
Create Date: 2026-06-11
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0007_sync_title_text"
down_revision: str | None = "0006_beta_tester_flag"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE synced_chats ALTER COLUMN title TYPE text")


def downgrade() -> None:
    # Sealed titles can exceed 200 chars; truncate rather than fail (the
    # client re-pushes plaintext-cap-200 titles after a key change anyway).
    op.execute(
        "ALTER TABLE synced_chats ALTER COLUMN title TYPE varchar(200) "
        "USING left(title, 200)"
    )
