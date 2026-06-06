"""Early-access waitlist signup.

Idempotent (``ON CONFLICT DO NOTHING`` on the unique email), always returns a
generic success so the endpoint never reveals whether an address is already on
the list. IP rate-limited to blunt spam.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import auth_rate_limit
from app.db.session import get_db, rls_tx
from app.schemas.waitlist import WaitlistResponse, WaitlistSignup
from app.services import analytics, identity

router = APIRouter(prefix="/api/waitlist", tags=["waitlist"])

_INSERT = text(
    "INSERT INTO waitlist (email, source) VALUES (:email, :source) "
    "ON CONFLICT (email) DO NOTHING"
)


@router.post("", response_model=WaitlistResponse)
async def join_waitlist(
    req: WaitlistSignup,
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(auth_rate_limit),
) -> WaitlistResponse:
    email = req.email.strip().lower()
    source = (req.source or "landing")[:64]
    async with rls_tx(session, None):
        await session.execute(_INSERT, {"email": email, "source": source})
    # Hashed distinct id — never store the raw email in analytics.
    analytics.capture(
        identity.anon_identity(email), "waitlist_joined", {"source": source}
    )
    return WaitlistResponse(detail="You're on the list — we'll be in touch.")
