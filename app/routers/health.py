"""Liveness/readiness probes.

``/health`` is a dependency-free liveness check (used by the Railway healthcheck
and exempt from rate limiting). ``/health/ready`` additionally verifies the DB is
reachable, for readiness gating.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(session: AsyncSession = Depends(get_db)) -> dict[str, str]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - exercised against a real DB
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database unavailable."
        ) from exc
    return {"status": "ready"}
