"""Founder/admin API — manual beta-tester approval.

Protected by a static bearer (``ADMIN_API_TOKEN``): every route 404s when the
token is unset (the API simply doesn't exist), and a wrong token also 404s so
the surface is unprobeable. Compared constant-time. This is deliberately a
plain header check rather than a user-role system — there are two founders and
the token lives only in Railway env + the founders' shells.

    GET  /api/admin/beta/pending  → accounts awaiting approval
    POST /api/admin/beta/approve  → {"email": ...} grant + approval email
    POST /api/admin/beta/revoke   → {"email": ...} revoke

Example (PowerShell):
    Invoke-RestMethod -Method Post -Uri https://api.branch-chat.com/api/admin/beta/approve `
      -Headers @{"X-Admin-Token"=$env:BRANCHCHAT_ADMIN_TOKEN} `
      -ContentType "application/json" -Body '{"email":"tester@example.com"}'
"""

from __future__ import annotations

import hmac
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db, rls_tx
from app.models import User
from app.services import analytics, email_service

router = APIRouter(prefix="/api/admin", tags=["admin"])

_NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, detail="Not Found")


async def require_admin(request: Request) -> None:
    token = settings.ADMIN_API_TOKEN
    supplied = request.headers.get("x-admin-token", "")
    # 404 (not 401/403) whether the API is disabled or the token is wrong:
    # the route shouldn't be discoverable by probing.
    if not token or not hmac.compare_digest(supplied, token):
        raise _NOT_FOUND


class BetaTarget(BaseModel):
    email: EmailStr


class PendingUser(BaseModel):
    email: str
    email_verified: bool
    created_at: datetime


class PendingResponse(BaseModel):
    pending: list[PendingUser]


class AdminMessage(BaseModel):
    detail: str


@router.get("/beta/pending", response_model=PendingResponse)
async def pending_beta_users(
    session: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
) -> PendingResponse:
    async with rls_tx(session, None):
        rows = (
            await session.execute(
                select(User.email, User.email_verified, User.created_at)
                .where(User.is_beta_tester.is_(False))
                .order_by(User.created_at.asc())
            )
        ).all()
    return PendingResponse(
        pending=[
            PendingUser(
                email=r.email,
                email_verified=r.email_verified,
                created_at=r.created_at,
            )
            for r in rows
        ]
    )


async def _set_beta(session: AsyncSession, email: str, value: bool) -> User:
    async with rls_tx(session, None):
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="No account with that email.",
            )
        user.is_beta_tester = value
    return user


@router.post("/beta/approve", response_model=AdminMessage)
async def approve_beta_user(
    req: BetaTarget,
    session: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
) -> AdminMessage:
    user = await _set_beta(session, req.email.strip().lower(), True)
    await email_service.send_beta_approved_email(user.email)
    analytics.capture(str(user.id), "beta_approved", {})
    return AdminMessage(detail=f"{user.email} approved and notified.")


@router.post("/beta/revoke", response_model=AdminMessage)
async def revoke_beta_user(
    req: BetaTarget,
    session: AsyncSession = Depends(get_db),
    _admin: None = Depends(require_admin),
) -> AdminMessage:
    user = await _set_beta(session, req.email.strip().lower(), False)
    return AdminMessage(detail=f"{user.email} beta access revoked.")
