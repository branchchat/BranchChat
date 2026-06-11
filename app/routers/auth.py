"""Authentication endpoints.

Enumeration-safe by design:
* signup always returns the same generic message (real signup → verify email;
  already-registered → "you already have an account" email), and never logs the
  caller in, so new vs existing email are indistinguishable to the client.
* login failures are a uniform 401 regardless of unknown-user / wrong-password /
  locked.
* password-reset request always returns 200.

All auth routes are IP rate-limited (brute-force) and marked ``no-store`` by the
security middleware.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import auth_rate_limit
from app.core.security import create_access_token
from app.db.session import get_db, rls_tx
from app.models import User
from app.routers.deps import IdentityContext, current_user, request_identity
from app.schemas.auth import (
    LoginRequest,
    MessageOut,
    RequestPasswordReset,
    ResetPassword,
    SignupRequest,
    UsageBucket,
    UsageStatus,
    UserOut,
    VerifyEmail,
)
from app.services import analytics, auth_service, email_service, identity, usage_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

_GENERIC_SIGNUP = "Account created. Check your email to verify your address."
_GENERIC_RESET_REQUEST = (
    "If an account exists for that email, we've sent a reset link."
)
_INVALID_CREDENTIALS = "Invalid email or password."
_INVALID_TOKEN = "Invalid or expired token."


def _set_auth_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=create_access_token(user_id),
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN,
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    # Mirror the attributes the cookie was set with, otherwise some browsers
    # won't treat this as the same cookie and won't clear it.
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        domain=settings.COOKIE_DOMAIN,
        path="/",
        secure=settings.COOKIE_SECURE,
        httponly=True,
        samesite=settings.COOKIE_SAMESITE,
    )


@router.post("/signup", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def signup(
    req: SignupRequest,
    ctx: IdentityContext = Depends(request_identity),
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(auth_rate_limit),
) -> MessageOut:
    email = req.email.strip().lower()

    created: User | None = None
    raw_verify: str | None = None
    async with rls_tx(session, None):
        if await auth_service.get_user_by_email(session, email) is None:
            created = await auth_service.create_user(session, email, req.password)
            if created is not None:
                raw_verify = await auth_service.create_email_token(
                    session, created, "verify"
                )

    if created is not None and raw_verify is not None:
        uid = str(created.id)
        analytics.alias(ctx.anon_id, uid)  # attribute pre-signup activity
        analytics.identify(uid, {"email": email})
        analytics.capture(uid, "user_signed_up", {})
        await email_service.send_verification_email(email, raw_verify)
    else:
        # Already registered (or a create race): identical response, helpful email.
        await email_service.send_account_exists_email(email)

    return MessageOut(detail=_GENERIC_SIGNUP)


@router.post("/login", response_model=UserOut)
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(auth_rate_limit),
) -> UserOut:
    user = await auth_service.authenticate(
        session, req.email, req.password, identity.client_ip(request)
    )
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=_INVALID_CREDENTIALS)
    _set_auth_cookie(response, str(user.id))
    analytics.capture(str(user.id), "user_logged_in", {})
    return UserOut.model_validate(user)


@router.post("/logout", response_model=MessageOut)
async def logout(response: Response) -> MessageOut:
    _clear_auth_cookie(response)
    return MessageOut(detail="Logged out.")


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.get("/usage", response_model=UsageStatus)
async def usage(
    ctx: IdentityContext = Depends(request_identity),
    session: AsyncSession = Depends(get_db),
) -> UsageStatus:
    async with rls_tx(session, ctx.user_id):
        used, limit = await usage_service.get_status(
            session, user_id=ctx.user_id, anon_id=ctx.anon_id
        )
        coding_used, coding_limit = await usage_service.get_coding_status(
            session, user_id=ctx.user_id, anon_id=ctx.anon_id
        )
        premium_used, premium_limit = await usage_service.get_premium_status(
            session, user_id=ctx.user_id, anon_id=ctx.anon_id
        )
    return UsageStatus(
        authenticated=ctx.user_id is not None,
        kind="standard",
        used=used,
        limit=limit,
        remaining=max(0, limit - used),
        coding=UsageBucket(
            used=coding_used,
            limit=coding_limit,
            remaining=max(0, coding_limit - coding_used),
        ),
        premium=UsageBucket(
            used=premium_used,
            limit=premium_limit,
            remaining=max(0, premium_limit - premium_used),
        ),
    )


@router.post("/request-password-reset", response_model=MessageOut)
async def request_password_reset(
    req: RequestPasswordReset,
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(auth_rate_limit),
) -> MessageOut:
    email = req.email.strip().lower()
    raw: str | None = None
    async with rls_tx(session, None):
        user = await auth_service.get_user_by_email(session, email)
        if user is not None:
            await auth_service.invalidate_tokens(session, user.id, "reset")
            raw = await auth_service.create_email_token(session, user, "reset")
    if raw is not None:
        await email_service.send_password_reset_email(email, raw)
    return MessageOut(detail=_GENERIC_RESET_REQUEST)


@router.post("/reset-password", response_model=MessageOut)
async def reset_password(
    req: ResetPassword,
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(auth_rate_limit),
) -> MessageOut:
    async with rls_tx(session, None):
        user = await auth_service.consume_email_token(session, req.token, "reset")
        if user is not None:
            await auth_service.set_password(session, user, req.password)
            await auth_service.invalidate_tokens(session, user.id, "reset")
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=_INVALID_TOKEN)
    return MessageOut(detail="Your password has been reset. You can now log in.")


@router.post("/verify-email", response_model=MessageOut)
async def verify_email(
    req: VerifyEmail,
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(auth_rate_limit),
) -> MessageOut:
    async with rls_tx(session, None):
        user = await auth_service.consume_email_token(session, req.token, "verify")
        if user is not None:
            await auth_service.mark_verified(session, user)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=_INVALID_TOKEN)
    analytics.capture(str(user.id), "email_verified", {})
    return MessageOut(detail="Your email has been verified.")


@router.post("/resend-verification", response_model=MessageOut)
async def resend_verification(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(auth_rate_limit),
) -> MessageOut:
    if user.email_verified:
        return MessageOut(detail="Your email is already verified.")
    async with rls_tx(session, str(user.id)):
        await auth_service.invalidate_tokens(session, user.id, "verify")
        raw = await auth_service.create_email_token(session, user, "verify")
    await email_service.send_verification_email(user.email, raw)
    return MessageOut(detail="Verification email sent.")
