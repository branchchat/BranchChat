"""Shared request dependencies.

``request_identity`` resolves who is calling for quota/attribution: it decodes
the session cookie (no DB hit) for an authenticated user id, and falls back to a
stable anonymous id issued as an HttpOnly cookie. ``current_user`` is the
DB-backed dependency that protects authenticated endpoints.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.db.session import get_db, rls_tx
from app.models import User
from app.services import auth_service, identity

_ANON_MAX_AGE = 60 * 60 * 24 * 365  # 1 year


@dataclass(frozen=True)
class IdentityContext:
    user_id: str | None
    anon_id: str
    client_ip: str

    @property
    def distinct_id(self) -> str:
        """The id analytics should attribute events to (user when known)."""
        return self.user_id or self.anon_id


def _decode_payload(request: Request) -> dict | None:
    token = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if not token:
        return None
    return security.decode_token(token)


def _decode_user_id(request: Request) -> str | None:
    payload = _decode_payload(request)
    if not payload:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None


async def request_identity(request: Request, response: Response) -> IdentityContext:
    user_id = _decode_user_id(request)

    anon_id = request.cookies.get(settings.ANON_COOKIE_NAME)
    if not anon_id:
        anon_id = identity.new_anon_id()
        response.set_cookie(
            key=settings.ANON_COOKIE_NAME,
            value=anon_id,
            max_age=_ANON_MAX_AGE,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite=settings.COOKIE_SAMESITE,
            domain=settings.COOKIE_DOMAIN,
            path="/",
        )

    return IdentityContext(
        user_id=user_id, anon_id=anon_id, client_ip=identity.client_ip(request)
    )


async def current_user(
    request: Request, session: AsyncSession = Depends(get_db)
) -> User:
    """Require a valid session cookie → loaded ``User``; else 401.

    Tokens issued before the user's last password change are rejected, so a
    stolen session dies the moment the real owner resets their password
    (``iat`` is compared at whole-second granularity — the resolution JWT
    stores — so a login in the same second as the change is not evicted).
    """
    payload = _decode_payload(request)
    user_id = payload.get("sub") if payload else None
    if payload is None or not isinstance(user_id, str):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Not authenticated."
        )
    async with rls_tx(session, user_id):
        user = await auth_service.get_user_by_id(session, user_id)
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail="Not authenticated."
        )
    if user.password_changed_at is not None:
        iat = payload.get("iat")
        if not isinstance(iat, (int, float)) or int(iat) < int(
            user.password_changed_at.timestamp()
        ):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, detail="Not authenticated."
            )
    return user
