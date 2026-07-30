from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserApiKey(Base):
    """A user's own provider API key (BYOK), sealed at rest.

    Replies generated with a user's key don't draw down the daily quota —
    they spend the user's own provider account, not ours. ``sealed_key`` is
    the ``sync_crypto.seal_text`` envelope (AES-256-GCM under the deploy-env
    key), so DB access alone never exposes a usable key; ``key_hint`` (last
    four characters) is the only fragment the API ever returns.

    Owner-scoped exactly like ``synced_chats``: RLS forces
    ``user_id = current_setting('app.user_id')`` on every operation, and the
    composite primary key keeps one row per (user, provider).
    """

    __tablename__ = "user_api_keys"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    provider: Mapped[str] = mapped_column(String(32), primary_key=True)
    sealed_key: Mapped[str] = mapped_column(Text, nullable=False)
    key_hint: Mapped[str] = mapped_column(String(8), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=text("now()"),
    )
