"""BYOK key management: store/list/remove the caller's provider API keys.

All routes require a signed-in session (``current_user``). A key is checked
against the vendor before storage — the detail strings on failure are
user-facing copy by contract, like the chat routes. The stored key is sealed
at rest and only ever returned as its last-four hint.

Saving keys is on the auth rate limit (each save costs an upstream call), and
in production requires ``SYNC_ENC_KEY`` so keys can never land in the DB in
plaintext.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import auth_rate_limit
from app.db.session import get_db, rls_tx
from app.models import User
from app.routers.deps import current_user
from app.schemas.api_keys import (
    ApiKeyIn,
    ApiKeyOut,
    ApiKeysResponse,
    MessageOut,
)
from app.services import byok_service

router = APIRouter(prefix="/api/keys", tags=["api-keys"])


def _require_provider(provider: str) -> str:
    cleaned = provider.strip().lower()
    if cleaned not in byok_service.BYOK_PROVIDERS:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Unknown provider."
        )
    return cleaned


@router.get("", response_model=ApiKeysResponse)
async def list_keys(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiKeysResponse:
    async with rls_tx(session, str(user.id)):
        rows = await byok_service.list_keys(session, user_id=str(user.id))
    return ApiKeysResponse(keys=[ApiKeyOut.model_validate(r) for r in rows])


@router.put("", response_model=ApiKeysResponse)
async def save_key(
    body: ApiKeyIn,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(auth_rate_limit),
) -> ApiKeysResponse:
    # Never store a key we can't seal: outside dev, a missing SYNC_ENC_KEY
    # would mean plaintext keys in the database.
    if settings.is_production and not settings.SYNC_ENC_KEY:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Key storage isn't configured on the server yet.",
        )

    try:
        await byok_service.validate_key(body.provider, body.api_key)
    except byok_service.KeyRejectedError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=(
                "That API key was rejected by the provider — check it and "
                "try again."
            ),
        ) from None
    except byok_service.KeyValidationUnavailableError:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Couldn't reach the provider to check that key. "
                "Please try again in a moment."
            ),
        ) from None

    async with rls_tx(session, str(user.id)):
        await byok_service.upsert_key(
            session,
            user_id=str(user.id),
            provider=body.provider,
            api_key=body.api_key,
        )
        rows = await byok_service.list_keys(session, user_id=str(user.id))
    return ApiKeysResponse(keys=[ApiKeyOut.model_validate(r) for r in rows])


@router.delete("/{provider}", response_model=MessageOut)
async def remove_key(
    provider: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> MessageOut:
    provider = _require_provider(provider)
    async with rls_tx(session, str(user.id)):
        removed = await byok_service.delete_key(
            session, user_id=str(user.id), provider=provider
        )
    if not removed:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="No stored key for that provider."
        )
    return MessageOut(detail="Key removed.")
