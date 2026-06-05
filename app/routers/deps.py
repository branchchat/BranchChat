"""Shared request dependencies.

``request_identity`` resolves who is calling for quota/attribution purposes:
an authenticated user id (once the auth milestone wires cookie→user) and a
stable anonymous id (issued as an HttpOnly cookie on first contact). The anon
cookie lets us attribute quota and analytics without an account.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request, Response

from app.core.config import settings
from app.services import identity

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


async def request_identity(request: Request, response: Response) -> IdentityContext:
    # Auth is not wired yet — callers are anonymous until the auth milestone
    # decodes the session cookie here and sets ``user_id``.
    user_id: str | None = None

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
