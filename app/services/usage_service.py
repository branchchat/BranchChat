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

from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import UsageCounter
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


def _today() -> date:
    # Return a date object (not a string): the `day` column is a Postgres DATE
    # and asyncpg binds it directly.
    return datetime.now(timezone.utc).date()


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


def _auth_limit(kind: str) -> int:
    if kind == "coding":
        return settings.AUTHENTICATED_CODE_DAILY_MESSAGE_LIMIT
    if kind == "premium":
        return settings.AUTHENTICATED_PREMIUM_DAILY_MESSAGE_LIMIT
    return settings.AUTHENTICATED_DAILY_MESSAGE_LIMIT


def _anon_limit(kind: str) -> int:
    if kind == "premium":
        return settings.FREE_PREMIUM_DAILY_MESSAGE_LIMIT
    return settings.FREE_DAILY_MESSAGE_LIMIT


async def enforce_message_quota(
    session: AsyncSession,
    *,
    user_id: str | None,
    anon_id: str,
    client_ip: str,
    kind: str,
) -> None:
    """Charge one AI message against the right bucket(s); raise 429 if exhausted.

    ``kind`` is "standard", "coding", or "premium" (high-cost models). Runs
    inside the caller's transaction so the increment and the request are
    atomic together.
    """
    if user_id is not None:
        limit = _auth_limit(kind)
        if not await _consume(session, identity_svc.user_identity(user_id), kind, limit):
            if kind == "coding":
                detail = f"You've reached today's coding-mode limit of {limit} messages."
            elif kind == "premium":
                detail = (
                    f"You've reached today's premium-model limit of {limit} messages. "
                    "Other models are still available."
                )
            else:
                detail = f"You've reached today's limit of {limit} messages. It resets tomorrow."
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)
        return

    # Anonymous: own bucket first (the limit users actually hit), then the
    # coarser network bucket. Same generic message for both — don't leak the
    # network mechanism.
    free = _anon_limit(kind)
    anon_msg = (
        "Premium models require an account. Sign in to use them."
        if kind == "premium" and free <= 0
        else (
            f"You've reached the free daily limit of {free} messages. "
            "Sign in to get more."
        )
    )
    if not await _consume(session, identity_svc.anon_identity(anon_id), kind, free):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=anon_msg)

    net_limit = free * settings.ANONYMOUS_NETWORK_BUCKET_MULTIPLIER
    if not await _consume(
        session, identity_svc.network_identity(client_ip), kind, net_limit
    ):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=anon_msg)


async def get_status(
    session: AsyncSession, *, user_id: str | None, anon_id: str
) -> tuple[int, int]:
    """Return ``(used, limit)`` for the caller's standard daily bucket today."""
    if user_id is not None:
        identity_hash = identity_svc.user_identity(user_id)
        limit = settings.AUTHENTICATED_DAILY_MESSAGE_LIMIT
    else:
        identity_hash = identity_svc.anon_identity(anon_id)
        limit = settings.FREE_DAILY_MESSAGE_LIMIT
    result = await session.execute(
        select(UsageCounter.count).where(
            UsageCounter.identity_hash == identity_hash,
            UsageCounter.day == _today(),
            UsageCounter.kind == "standard",
        )
    )
    used = result.scalar_one_or_none() or 0
    return used, limit


async def get_coding_status(
    session: AsyncSession, *, user_id: str | None, anon_id: str
) -> tuple[int, int]:
    """Return ``(used, limit)`` for the caller's coding-mode daily bucket today."""
    if user_id is not None:
        identity_hash = identity_svc.user_identity(user_id)
        limit = settings.AUTHENTICATED_CODE_DAILY_MESSAGE_LIMIT
    else:
        identity_hash = identity_svc.anon_identity(anon_id)
        limit = settings.FREE_DAILY_MESSAGE_LIMIT
    result = await session.execute(
        select(UsageCounter.count).where(
            UsageCounter.identity_hash == identity_hash,
            UsageCounter.day == _today(),
            UsageCounter.kind == "coding",
        )
    )
    used = result.scalar_one_or_none() or 0
    return used, limit


async def get_premium_status(
    session: AsyncSession, *, user_id: str | None, anon_id: str
) -> tuple[int, int]:
    """Return ``(used, limit)`` for the caller's premium-model daily bucket today."""
    if user_id is not None:
        identity_hash = identity_svc.user_identity(user_id)
    else:
        identity_hash = identity_svc.anon_identity(anon_id)
    limit = _auth_limit("premium") if user_id is not None else _anon_limit("premium")
    result = await session.execute(
        select(UsageCounter.count).where(
            UsageCounter.identity_hash == identity_hash,
            UsageCounter.day == _today(),
            UsageCounter.kind == "premium",
        )
    )
    used = result.scalar_one_or_none() or 0
    return used, limit


_REFUND = text(
    """
    UPDATE usage_counters
    SET count = GREATEST(count - 1, 0), updated_at = now()
    WHERE identity_hash = :ih AND day = :day AND kind = :kind
    """
)


async def _release(session: AsyncSession, identity_hash: str, kind: str) -> None:
    await session.execute(
        _REFUND, {"ih": identity_hash, "day": _today(), "kind": kind}
    )


async def refund_message_quota(
    session: AsyncSession,
    *,
    user_id: str | None,
    anon_id: str,
    client_ip: str,
    kind: str,
) -> None:
    """Give back one message previously charged by ``enforce_message_quota``.

    Called when the provider request fails (e.g. a 5xx) so a caller is only
    charged for a successful reply. Mirrors the bucket(s) enforce charges: the
    user bucket for authenticated callers, or both the anon and network buckets
    for anonymous callers. Never drops a counter below zero.
    """
    if user_id is not None:
        await _release(session, identity_svc.user_identity(user_id), kind)
        return
    await _release(session, identity_svc.anon_identity(anon_id), kind)
    net_limit = _anon_limit(kind) * settings.ANONYMOUS_NETWORK_BUCKET_MULTIPLIER
    if net_limit > 0:
        await _release(session, identity_svc.network_identity(client_ip), kind)
