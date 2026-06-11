"""Stateless unsubscribe tokens for marketing email.

An unsubscribe link must keep working indefinitely (no expiry) and must not be
guessable for an arbitrary address, but we don't want to store a token row per
recipient. So the token is a self-authenticating HMAC of the email under
``JWT_SECRET_KEY`` (a distinct purpose label keeps it from ever colliding with
an auth JWT): ``b64url(email).b64url(hmac_sha256("unsubscribe:" + email))``.

Verification recomputes the signature and compares constant-time, so a tampered
or fabricated token is rejected without a database lookup. The DB only records
the *result* of a valid unsubscribe (waitlist.unsubscribed_at).
"""

from __future__ import annotations

import base64
import hashlib
import hmac

from app.core.config import settings

_PURPOSE = b"unsubscribe:"


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(value: str) -> bytes:
    pad = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + pad)


def _sign(email: str) -> bytes:
    return hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        _PURPOSE + email.encode("utf-8"),
        hashlib.sha256,
    ).digest()


def make_token(email: str) -> str:
    email = email.strip().lower()
    return f"{_b64e(email.encode('utf-8'))}.{_b64e(_sign(email))}"


def verify_token(token: str) -> str | None:
    """Return the email a valid token authorizes, or None if it's tampered."""
    try:
        payload, sig = token.split(".", 1)
        email = _b64d(payload).decode("utf-8")
        expected = _sign(email)
        if hmac.compare_digest(_b64d(sig), expected):
            return email
    except (ValueError, UnicodeDecodeError):
        pass
    return None


def unsubscribe_url(email: str) -> str:
    base = settings.API_PUBLIC_URL.rstrip("/")
    return f"{base}/api/unsubscribe?token={make_token(email)}"
