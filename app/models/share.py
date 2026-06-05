from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ShareSnapshot(Base):
    """A read-only, point-in-time snapshot of a branch, shared by URL token.

    This is the one genuinely owner-scoped table: RLS enforces
    ``owner_user_id = current_setting('app.user_id')`` for owner operations
    (list/create/delete), while the public ``GET /api/share/{token}`` read goes
    through a SECURITY DEFINER path so an unauthenticated viewer can load a valid,
    unexpired snapshot without seeing anyone else's rows.
    """

    __tablename__ = "share_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # URL-safe random token (we index/look up by this, not by id).
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    view_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
