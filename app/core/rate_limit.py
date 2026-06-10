"""Layered rate limiting with a Redis-ready interface.

The ``RateLimiter`` protocol is the seam: today an in-process sliding-window
limiter (fine for a single backend instance); swap in a Redis-backed
implementation when we scale horizontally (todo.md P2) without touching callers.

Layers:
* global per-IP — ``RateLimitMiddleware`` (every request)
* AI per-IP — ``ai_rate_limit`` dependency (the expensive chat routes)
* auth per-IP — ``auth_rate_limit`` dependency (brute-force surface)
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Protocol

from fastapi import HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings
from app.services import identity


class RateLimiter(Protocol):
    async def hit(self, key: str, limit: int, window_seconds: int) -> bool:
        """Record a hit; return False if ``key`` is now over ``limit`` in the window."""
        ...


class InMemoryRateLimiter:
    """Sliding-window counter kept in process memory.

    Entries self-expire as their window slides, and a periodic sweep drops
    keys idle for over an hour — otherwise an attacker rotating source IPs
    would grow the dict without bound (a slow memory-exhaustion vector).
    """

    # Sweep cadence (hits between sweeps) and how long a key may sit idle.
    _SWEEP_EVERY = 4096
    _IDLE_SECONDS = 3600.0

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._ops = 0

    def _sweep(self, now: float) -> None:
        stale = now - self._IDLE_SECONDS
        for key in [k for k, dq in self._hits.items() if not dq or dq[-1] < stale]:
            del self._hits[key]

    async def hit(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.time()
        self._ops += 1
        if self._ops % self._SWEEP_EVERY == 0:
            self._sweep(now)
        cutoff = now - window_seconds
        dq = self._hits[key]
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            return False
        dq.append(now)
        return True


# Process-wide limiter instance (swap for a Redis impl behind the same protocol).
limiter: RateLimiter = InMemoryRateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Coarse global per-IP limit on every request except health/preflight."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or request.url.path == "/health":
            return await call_next(request)
        ip = identity.client_ip(request)
        if not await limiter.hit(
            f"global:{ip}", settings.RATE_LIMIT_GLOBAL_PER_MIN, 60
        ):
            return JSONResponse(
                {"detail": "Too many requests. Please slow down."},
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return await call_next(request)


async def ai_rate_limit(request: Request) -> None:
    ip = identity.client_ip(request)
    if not await limiter.hit(f"ai:{ip}", settings.RATE_LIMIT_AI_PER_MIN, 60):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You're sending messages too quickly. Please wait a moment.",
        )


async def auth_rate_limit(request: Request) -> None:
    ip = identity.client_ip(request)
    if not await limiter.hit(f"auth:{ip}", settings.RATE_LIMIT_AUTH_PER_MIN, 60):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait and try again.",
        )
