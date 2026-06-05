"""Opaque identity derivation for quota attribution.

We never store a raw IP or email for rate/usage purposes. Instead we derive a
keyed HMAC-SHA256 (``ANON_IDENTITY_SALT``) so the stored ``identity_hash`` is not
reversible to PII and is stable per actor. Three buckets:

* ``user:<uuid>``  — an authenticated account
* ``anon:<id>``    — an anonymous browser (cookie ``branchchat_anon_id``)
* ``net:<ip>``     — a coarse network bucket to blunt anonymous-cookie farming
"""

from __future__ import annotations

import hmac
import secrets
from hashlib import sha256

from starlette.requests import Request

from app.core.config import settings


def _hmac(value: str) -> str:
    return hmac.new(
        settings.ANON_IDENTITY_SALT.encode("utf-8"),
        value.encode("utf-8"),
        sha256,
    ).hexdigest()


def user_identity(user_id: str) -> str:
    return _hmac(f"user:{user_id}")


def anon_identity(anon_id: str) -> str:
    return _hmac(f"anon:{anon_id}")


def network_identity(ip: str) -> str:
    return _hmac(f"net:{ip}")


def new_anon_id() -> str:
    """A fresh, unguessable anonymous id to set as a cookie."""
    return secrets.token_urlsafe(24)


def client_ip(request: Request) -> str:
    """Best-effort client IP.

    Only trust ``X-Forwarded-For`` when explicitly configured to (the platform
    sits behind a trusted proxy); otherwise a client could spoof the header to
    evade the network bucket.
    """
    if settings.TRUST_PROXY_FORWARDED_IP:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"
