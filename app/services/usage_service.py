"""Daily AI usage quotas.

Counters are incremented with a single atomic upsert so concurrent requests can't
race past the limit, and so a request that is OVER the limit never increments
(the ``WHERE count < :limit`` guard). Anonymous callers are limited both by their
own cookie bucket and by a coarser network bucket, which blunts someone clearing
the anon cookie to farm free messages.

Quota-exceeded raises HTTP 429 with a human-readable ``detail`` the frontend
shows directly. Error copy never reveals the network-bucket mechanism.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services import identity as identity_svc

_UPSERT = text(
    """
    INSERT INTO usage_counters (identity_hash, day, kind, count, updated_at)
    VALUES (:ih, :day, :kind, 1, now())
    ON CONFLICT (identity_hash, day, kind)
    DO UPDATE SET count = usage_counters.count + 1, updated_at = now()
    WHERE usage_counters.count < :limit
    RETURNING count
    """
)


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


async def _consume(
    session: AsyncSession, identity_hash: str, kind: str, limit: int
) -> bool:
    """Atomically increment a bucket. Returns False (without incrementing) if at/over limit."""
    if limit <= 0:
        return False
    result = await session.execute(
        _UPSERT,
        {"ih": identity_hash, "day": _today(), "kind": kind, "limit": limit},
    )
    return result.scalar_one_or_none() is not None


async def enforce_message_quota(
    session: AsyncSession,
    *,
    user_id: str | None,
    anon_id: str,
    client_ip: str,
    coding_mode: bool,
) -> None:
    """Charge one AI message against the right bucket(s); raise 429 if exhausted.

    Runs inside the caller's transaction so the increment and the request are
    atomic together.
    """
    kind = "coding" if coding_mode else "standard"

    if user_id is not None:
        limit = (
            settings.AUTHENTICATED_CODE_DAILY_MESSAGE_LIMIT
            if coding_mode
            else settings.AUTHENTICATED_DAILY_MESSAGE_LIMIT
        )
        if not await _consume(session, identity_svc.user_identity(user_id), kind, limit):
            detail = (
                f"You've reached today's coding-mode limit of {limit} messages."
                if coding_mode
                else f"You've reached today's limit of {limit} messages. It resets tomorrow."
            )
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)
        return

    # Anonymous: own bucket first (the limit users actually hit), then the
    # coarser network bucket. Same generic message for both — don't leak the
    # network mechanism.
    anon_msg = (
        f"You've reached the free daily limit of {settings.FREE_DAILY_MESSAGE_LIMIT} "
        "messages. Sign in to get more."
    )
    free = settings.FREE_DAILY_MESSAGE_LIMIT
    if not await _consume(session, identity_svc.anon_identity(anon_id), kind, free):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=anon_msg)

    net_limit = free * settings.ANONYMOUS_NETWORK_BUCKET_MULTIPLIER
    if not await _consume(
        session, identity_svc.network_identity(client_ip), kind, net_limit
    ):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=anon_msg)
