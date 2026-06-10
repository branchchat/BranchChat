"""Authentication business logic.

Security properties enforced here:

* **No user enumeration.** ``authenticate`` returns ``None`` for both "no such
  account" and "wrong password", and always runs an argon2 verify (against
  ``DUMMY_HASH`` when the user is missing) so response timing is uniform.
* **Account lockout.** After ``LOGIN_MAX_FAILED`` failures the account is locked
  for ``LOGIN_LOCKOUT_MINUTES``; while locked, even a correct password fails —
  and still returns the same generic result, so lock state isn't observable.
* **Durable IP throttle.** Failed attempts are counted from the
  ``login_attempts`` table (``LOGIN_IP_MAX_FAILED`` per window), so the brake on
  a single network source spraying many accounts survives restarts and applies
  across instances — unlike the in-memory per-route limiter.
* **Sessions die on password change.** ``set_password`` stamps
  ``password_changed_at``; ``current_user`` rejects tokens issued before it.
* **Single-use tokens.** Email/reset tokens are matched by SHA-256 hash, checked
  for expiry + prior use, and marked used on consumption.

Transaction discipline: ``authenticate`` manages its own short transactions so
the (CPU-bound) password verify never holds a pooled DB connection. Other
functions run inside the caller's ``rls_tx`` transaction.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.db.session import rls_tx
from app.models import EmailToken, LoginAttempt, User
from app.services import identity


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(
        select(User).where(User.email == email.strip().lower())
    )
    return result.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: str | uuid.UUID) -> User | None:
    try:
        uid = uuid.UUID(str(user_id))
    except (ValueError, AttributeError):
        return None
    result = await session.execute(select(User).where(User.id == uid))
    return result.scalar_one_or_none()


async def create_user(session: AsyncSession, email: str, password: str) -> User | None:
    """Insert a new account. Returns None if the email is already taken."""
    user = User(
        email=email.strip().lower(),
        password_hash=security.hash_password(password),
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        return None
    return user


async def _record_attempt(
    session: AsyncSession, email: str, ip: str, success: bool
) -> None:
    session.add_all(
        [
            LoginAttempt(
                identifier=identity.account_identifier(email),
                scope="account",
                success=success,
            ),
            LoginAttempt(
                identifier=identity.network_identity(ip),
                scope="ip",
                success=success,
            ),
        ]
    )


async def _ip_failures_in_window(session: AsyncSession, ip: str) -> int:
    """Failed attempts from this network source within the throttle window.

    Counted from the durable ``login_attempts`` table (not process memory) so
    the brake survives restarts and is shared across instances. Uses the
    ``(identifier, scope, created_at)`` index.
    """
    since = _now() - timedelta(minutes=settings.LOGIN_IP_WINDOW_MINUTES)
    result = await session.execute(
        select(func.count())
        .select_from(LoginAttempt)
        .where(
            LoginAttempt.identifier == identity.network_identity(ip),
            LoginAttempt.scope == "ip",
            LoginAttempt.success.is_(False),
            LoginAttempt.created_at > since,
        )
    )
    return int(result.scalar_one())


async def _prune_stale_attempts(session: AsyncSession) -> None:
    """Sweep audit rows past the retention window (indexed ranged delete).

    Called only on SUCCESSFUL logins — rare and user-driven — so attack
    traffic (failures) can never use the sweep to amplify DB work. 30-day
    retention is far beyond the 15-minute throttle window.
    """
    days = settings.LOGIN_ATTEMPTS_RETENTION_DAYS
    if days <= 0:
        return
    await session.execute(
        delete(LoginAttempt).where(
            LoginAttempt.created_at < _now() - timedelta(days=days)
        )
    )


async def authenticate(
    session: AsyncSession, email: str, password: str, ip: str
) -> User | None:
    email = email.strip().lower()

    async with rls_tx(session, None):
        user = await get_user_by_email(session, email)
        ip_throttled = (
            settings.LOGIN_IP_MAX_FAILED > 0
            and await _ip_failures_in_window(session, ip)
            >= settings.LOGIN_IP_MAX_FAILED
        )

    now = _now()
    locked = bool(user and user.locked_until and user.locked_until > now)
    # IP-throttled requests take the same code path as a lockout: dummy verify
    # (uniform timing), attempt recorded, uniform failure result — so the
    # throttle is not observable and can't be used to probe accounts.
    blocked = locked or ip_throttled

    # Always run a verify so timing is identical whether or not the user exists.
    if user is not None and not blocked:
        ok = security.verify_password(user.password_hash, password)
    else:
        security.verify_password(security.DUMMY_HASH, password)
        ok = False

    async with rls_tx(session, None):
        await _record_attempt(session, email, ip, success=ok and not blocked)
        if user is not None and not blocked:
            if ok:
                user.failed_login_count = 0
                user.locked_until = None
                await _prune_stale_attempts(session)
            else:
                user.failed_login_count += 1
                if user.failed_login_count >= settings.LOGIN_MAX_FAILED:
                    user.locked_until = now + timedelta(
                        minutes=settings.LOGIN_LOCKOUT_MINUTES
                    )
                    user.failed_login_count = 0
            session.add(user)

    return user if (ok and not blocked) else None


async def create_email_token(
    session: AsyncSession, user: User, purpose: str
) -> str:
    raw = security.generate_email_token()
    if purpose == "reset":
        expires = _now() + timedelta(minutes=settings.RESET_TOKEN_TTL_MINUTES)
    else:  # "verify"
        expires = _now() + timedelta(hours=settings.VERIFY_TOKEN_TTL_HOURS)
    session.add(
        EmailToken(
            user_id=user.id,
            token_hash=security.hash_email_token(raw),
            purpose=purpose,
            expires_at=expires,
        )
    )
    return raw


async def consume_email_token(
    session: AsyncSession, raw_token: str, purpose: str
) -> User | None:
    token_hash = security.hash_email_token(raw_token)
    result = await session.execute(
        select(EmailToken).where(
            EmailToken.token_hash == token_hash, EmailToken.purpose == purpose
        )
    )
    token = result.scalar_one_or_none()
    now = _now()
    if token is None or token.used_at is not None or token.expires_at <= now:
        return None
    token.used_at = now
    session.add(token)
    return await get_user_by_id(session, token.user_id)


async def invalidate_tokens(
    session: AsyncSession, user_id: uuid.UUID, purpose: str
) -> None:
    await session.execute(
        update(EmailToken)
        .where(
            EmailToken.user_id == user_id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
        .values(used_at=_now())
    )


async def set_password(session: AsyncSession, user: User, new_password: str) -> None:
    user.password_hash = security.hash_password(new_password)
    user.failed_login_count = 0
    user.locked_until = None
    # Invalidate every session issued before this moment: a stolen cookie must
    # not survive a password reset (current_user compares the token's iat).
    user.password_changed_at = _now()
    session.add(user)


async def mark_verified(session: AsyncSession, user: User) -> None:
    user.email_verified = True
    session.add(user)
