"""Async engine, connection pool, and the RLS-aware transaction helper.

Pooling: a bounded SQLAlchemy pool (``DB_POOL_SIZE`` + ``DB_MAX_OVERFLOW`` → the
10–20 connection target) with ``pool_pre_ping`` so stale connections behind a
pooler are recycled rather than handed to a request.

Supabase / PgBouncer: in transaction-pooling mode asyncpg's prepared statements
break (a statement prepared on one server connection may execute on another), so
we disable both asyncpg's statement cache and SQLAlchemy's prepared-statement
cache when ``DB_USE_PGBOUNCER`` is set.

RLS: ``rls_tx`` opens a transaction and binds the authenticated user id to the
``app.user_id`` GUC for its lifetime (``set_config(..., is_local => true)`` is
transaction-scoped). Wrap every ownership-sensitive unit of work in it so the
row-level-security policies enforce ownership even if an app-level check is missed.
"""

from __future__ import annotations

import ssl
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import settings


def _ssl_context() -> ssl.SSLContext:
    """TLS context for managed Postgres (Supabase).

    Supabase's pooler presents a certificate signed by a PRIVATE CA, so default
    verification fails with "self-signed certificate in certificate chain". We
    keep the connection encrypted in transit but skip CA verification
    (equivalent to libpq ``sslmode=require``). To upgrade to full verification,
    pin Supabase's CA cert via ``ctx.load_verify_locations(...)`` and re-enable
    ``check_hostname`` / ``verify_mode``.
    """
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _connect_args() -> dict[str, object]:
    args: dict[str, object] = {}
    if settings.DB_SSL:
        args["ssl"] = _ssl_context()
    if settings.DB_USE_PGBOUNCER:
        # Disable asyncpg's own prepared-statement cache.
        args["statement_cache_size"] = 0
    return args


def _app_url() -> str:
    url = settings.DATABASE_URL
    if settings.DB_USE_PGBOUNCER and "prepared_statement_cache_size" not in url:
        # Disable SQLAlchemy's asyncpg prepared-statement cache as well.
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}prepared_statement_cache_size=0"
    return url


def _engine_kwargs() -> dict[str, object]:
    kwargs: dict[str, object] = {
        "echo": settings.DB_ECHO,
        "pool_pre_ping": True,
        "connect_args": _connect_args(),
    }
    if settings.ENV == "test":
        # Tests drive the app over a sync TestClient that spins a fresh event
        # loop per request; a pooled asyncpg connection bound to a finished loop
        # breaks. NullPool opens/closes a connection within each request's loop.
        kwargs["poolclass"] = NullPool
    else:
        kwargs.update(
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT,
            pool_recycle=settings.DB_POOL_RECYCLE,
        )
    return kwargs


engine = create_async_engine(_app_url(), **_engine_kwargs())

SessionLocal = async_sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: a session with no open transaction.

    Endpoints open their own (RLS-bound) transactions via ``rls_tx`` so that a
    slow external call (e.g. Gemini) never holds a DB connection open.
    """
    async with SessionLocal() as session:
        yield session


@asynccontextmanager
async def rls_tx(
    session: AsyncSession, user_id: str | None = None
) -> AsyncIterator[None]:
    """Transaction with the RLS user GUC bound for its duration.

    ``user_id`` of ``None`` (anonymous / pre-auth) leaves the GUC empty, so
    owner-scoped policies (``owner_user_id = current_setting('app.user_id')``)
    match no rows.
    """
    async with session.begin():
        await session.execute(
            text("SELECT set_config(:guc, :val, true)"),
            {"guc": settings.DB_RLS_GUC, "val": str(user_id) if user_id else ""},
        )
        yield
