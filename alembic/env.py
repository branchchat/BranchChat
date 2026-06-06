"""Alembic environment — async, driven by application settings.

Runs migrations over the admin/direct connection (``settings.alembic_url``) so
DDL, ``CREATE EXTENSION``, ``CREATE POLICY`` and GRANTs succeed. The app itself
connects as the restricted ``app_user`` role at runtime.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.base import Base

# Populate Base.metadata with every model for autogenerate.
import app.models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.alembic_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    # Supabase (and other managed Postgres) require TLS; the pooler/direct hosts
    # present publicly-trusted certs so default verification works.
    connect_args = {"ssl": True} if settings.DB_SSL else {}
    engine = create_async_engine(
        settings.alembic_url, pool_pre_ping=True, connect_args=connect_args
    )
    async with engine.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
