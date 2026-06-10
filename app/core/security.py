"""Password hashing, JWT session tokens, and email-token helpers.

* Passwords: argon2id (memory-hard) via argon2-cffi. ``DUMMY_HASH`` is verified
  against when an account is *not* found so login timing doesn't reveal whether
  an email exists (user-enumeration defence).
* Sessions: short-lived HS256 JWT carried in an HttpOnly cookie. ``decode_token``
  returns ``None`` on any invalid/expired token (no exception leaks to callers).
* Email tokens: a high-entropy URL token is mailed to the user; only its SHA-256
  hash is stored, so a DB read can't reconstruct a usable link.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error

from app.core.config import settings

_ph = PasswordHasher()

# Precomputed at import so the not-found login path runs a real verify (timing).
DUMMY_HASH = _ph.hash("timing-equalisation-placeholder")


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        return _ph.verify(stored_hash, password)
    except (Argon2Error, Exception):  # noqa: BLE001 - any failure == not verified
        return False


def needs_rehash(stored_hash: str) -> bool:
    try:
        return _ph.check_needs_rehash(stored_hash)
    except Argon2Error:  # pragma: no cover
        return False


def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            # Defence in depth: reject tokens missing expiry/subject/issued-at
            # even if they verify, and keep the algorithm allow-list explicit
            # (no "none"). ``iat`` backs password-change session revocation.
            options={"require": ["exp", "sub", "iat"]},
        )
    except jwt.PyJWTError:
        return None


def generate_email_token() -> str:
    """Raw, single-use token to email (never stored in the clear)."""
    return secrets.token_urlsafe(32)


def hash_email_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
