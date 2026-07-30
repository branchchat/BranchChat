"""BYOK: store and resolve user-supplied provider API keys.

A key is validated against the vendor's cheapest authenticated endpoint
BEFORE it is stored (a typo'd key should fail at save time, not at first
chat), sealed with ``sync_crypto.seal_text`` (AES-256-GCM under the deploy
env key), and only ever surfaced as a last-four hint afterwards.

Chat requests from a user with a stored key for the target provider run on
that key and skip the daily quota — they spend the user's own provider
account, not ours. Ollama is keyless/local, so it is not a BYOK provider.

Callers own the transaction: every CRUD helper here expects to run inside
``rls_tx(session, user_id)`` so the owner-scoped RLS policy applies.
"""

from __future__ import annotations

import logging

import httpx
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import UserApiKey
from app.services import sync_crypto

logger = logging.getLogger(__name__)

#: Providers a user may bring a key for (registry names; ollama is keyless).
BYOK_PROVIDERS: tuple[str, ...] = ("gemini", "openai", "anthropic")

_VALIDATION_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


class KeyRejectedError(Exception):
    """The vendor rejected this API key (bad/revoked/unauthorized)."""


class KeyValidationUnavailableError(Exception):
    """The vendor couldn't be reached to check the key; try again later."""


def key_hint(api_key: str) -> str:
    return api_key[-4:] if len(api_key) >= 4 else api_key


async def _check(request_coro) -> httpx.Response:
    try:
        return await request_coro
    except httpx.HTTPError as exc:
        raise KeyValidationUnavailableError(str(exc)) from exc


async def validate_key(provider: str, api_key: str) -> None:
    """Hit the vendor's model-list endpoint with the key; raise if unusable.

    Never include upstream response bodies in raised errors (same rule as the
    provider layer) — log server-side instead.
    """
    async with httpx.AsyncClient(timeout=_VALIDATION_TIMEOUT) as client:
        if provider == "gemini":
            resp = await _check(
                client.get(
                    f"{settings.GEMINI_BASE_URL}/v1beta/models",
                    params={"pageSize": 1},
                    headers={"x-goog-api-key": api_key},
                )
            )
        elif provider == "openai":
            resp = await _check(
                client.get(
                    f"{settings.OPENAI_BASE_URL}/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
            )
        elif provider == "anthropic":
            resp = await _check(
                client.get(
                    f"{settings.ANTHROPIC_BASE_URL}/v1/models",
                    params={"limit": 1},
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                )
            )
        else:  # pragma: no cover - the router validates the provider first
            raise KeyRejectedError(f"unsupported provider: {provider}")

    if resp.status_code in (400, 401, 403):
        logger.info(
            "BYOK key rejected by %s (HTTP %s)", provider, resp.status_code
        )
        raise KeyRejectedError(provider)
    if resp.status_code >= 400:
        logger.warning(
            "BYOK validation upstream error from %s (HTTP %s)",
            provider,
            resp.status_code,
        )
        raise KeyValidationUnavailableError(provider)


async def upsert_key(
    session: AsyncSession, *, user_id: str, provider: str, api_key: str
) -> None:
    """Insert or replace the caller's key for ``provider`` (sealed)."""
    stmt = pg_insert(UserApiKey).values(
        user_id=user_id,
        provider=provider,
        sealed_key=sync_crypto.seal_text(api_key),
        key_hint=key_hint(api_key),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[UserApiKey.user_id, UserApiKey.provider],
        set_={
            "sealed_key": stmt.excluded.sealed_key,
            "key_hint": stmt.excluded.key_hint,
            "updated_at": stmt.excluded.updated_at,
        },
    )
    await session.execute(stmt)


async def list_keys(
    session: AsyncSession, *, user_id: str
) -> list[UserApiKey]:
    result = await session.execute(
        select(UserApiKey)
        .where(UserApiKey.user_id == user_id)
        .order_by(UserApiKey.provider)
    )
    return list(result.scalars())


async def delete_key(
    session: AsyncSession, *, user_id: str, provider: str
) -> bool:
    result = await session.execute(
        delete(UserApiKey).where(
            UserApiKey.user_id == user_id, UserApiKey.provider == provider
        )
    )
    return bool(result.rowcount)


async def stored_providers(
    session: AsyncSession, *, user_id: str
) -> list[str]:
    """Provider names the user holds a key for (for /api/models)."""
    result = await session.execute(
        select(UserApiKey.provider).where(UserApiKey.user_id == user_id)
    )
    return [row[0] for row in result]


async def resolve_key(
    session: AsyncSession, *, user_id: str, provider: str
) -> str | None:
    """The caller's usable plaintext key for ``provider``, or None.

    An unopenable sealed row (env key rotated/lost) resolves as None so chat
    falls back to the house key + quota instead of hard-failing; the user can
    re-add their key in settings.
    """
    result = await session.execute(
        select(UserApiKey.sealed_key).where(
            UserApiKey.user_id == user_id, UserApiKey.provider == provider
        )
    )
    sealed = result.scalar_one_or_none()
    if sealed is None:
        return None
    try:
        return sync_crypto.unseal_text(sealed)
    except sync_crypto.SealedPayloadError:
        logger.warning(
            "BYOK key for user=%s provider=%s cannot be unsealed; ignoring",
            user_id,
            provider,
        )
        return None
