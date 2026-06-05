from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LoginAttempt(Base):
    """Audit + throttle row for authentication attempts.

    ``identifier`` is a hash (email-hash for ``scope='account'`` or IP-hash for
    ``scope='ip'``) — no raw PII. Recent rows are counted to throttle brute-force
    by IP; per-account lockout additionally lives on ``users.locked_until``. Kept
    DB-backed so limits survive a process restart (in-memory limiters don't).
    """

    __tablename__ = "login_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    identifier: Mapped[str] = mapped_column(String(64), nullable=False)
    # "account" | "ip"
    scope: Mapped[str] = mapped_column(String(16), nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
