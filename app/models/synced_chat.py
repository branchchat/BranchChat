from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SyncedChat(Base):
    """An authenticated user's chat tree, synced as an opaque versioned blob.

    The app stays local-first: the browser's localStorage is the working copy
    and this table is a per-chat backup/sync target. The payload is the same
    versioned envelope the frontend's export/import uses (``branchchat-session``
    v1), stored opaquely — the backend never interprets the tree. Conflict
    resolution is last-write-wins on ``client_updated_at`` (the chat's own
    ``updatedAt`` ms timestamp), which is the right tool for a single user
    syncing devices, not collaborative editing.

    Owner-scoped exactly like ``share_snapshots``: RLS forces
    ``user_id = current_setting('app.user_id')`` on every operation.
    """

    __tablename__ = "synced_chats"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # The frontend's chat id (client-generated string), unique per user.
    chat_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # The chat's updatedAt (epoch ms) as reported by the client — the
    # last-write-wins version. BigInteger: ms timestamps overflow int4.
    client_updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
