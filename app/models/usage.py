from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UsageCounter(Base):
    """Per-identity, per-day AI message counter backing daily quotas.

    ``identity_hash`` is an opaque HMAC of the user id or anonymous id — never a
    raw IP or email — so the table holds no PII. The unique ``(identity_hash,
    day, kind)`` key makes the counter an idempotent upsert target and the index
    that every quota read hits.
    """

    __tablename__ = "usage_counters"
    __table_args__ = (
        UniqueConstraint(
            "identity_hash", "day", "kind", name="uq_usage_identity_day_kind"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    identity_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    # "standard" | "coding"
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
