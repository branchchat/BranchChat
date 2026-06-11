"""DB-backed quota tests — exercise the real atomic upsert + status read.

Hits Postgres directly (the path the stubbed chat-contract tests skip), so the
`day`-binding / over-limit logic is covered. Skips if no DB is reachable.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, text

from app.core.config import settings
from app.db.session import SessionLocal, rls_tx
from app.models import UsageCounter
from app.services import identity, usage_service

pytestmark = pytest.mark.asyncio


async def _db_up() -> bool:
    try:
        async with SessionLocal() as s:
            await s.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


async def test_anon_quota_increments_then_blocks_429():
    if not await _db_up():
        pytest.skip("Postgres not reachable")

    anon = "usage-test-anon"
    ip = "203.0.113.9"
    hashes = [identity.anon_identity(anon), identity.network_identity(ip)]

    async with SessionLocal() as session:
        async with rls_tx(session, None):
            await session.execute(
                delete(UsageCounter).where(UsageCounter.identity_hash.in_(hashes))
            )

        # Exactly FREE_DAILY_MESSAGE_LIMIT messages are allowed.
        for _ in range(settings.FREE_DAILY_MESSAGE_LIMIT):
            async with rls_tx(session, None):
                await usage_service.enforce_message_quota(
                    session, user_id=None, anon_id=anon, client_ip=ip, kind="standard"
                )

        # The next one is rejected with 429 — and must NOT have incremented.
        with pytest.raises(HTTPException) as exc:
            async with rls_tx(session, None):
                await usage_service.enforce_message_quota(
                    session, user_id=None, anon_id=anon, client_ip=ip, kind="standard"
                )
        assert exc.value.status_code == 429

        async with rls_tx(session, None):
            used, limit = await usage_service.get_status(
                session, user_id=None, anon_id=anon
            )
        assert used == settings.FREE_DAILY_MESSAGE_LIMIT
        assert limit == settings.FREE_DAILY_MESSAGE_LIMIT

        # cleanup
        async with rls_tx(session, None):
            await session.execute(
                delete(UsageCounter).where(UsageCounter.identity_hash.in_(hashes))
            )
