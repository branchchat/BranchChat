"""DB-backed auth regression tests — the OWASP edge cases that become incidents.

Requires a live Postgres (migrated). Skips automatically if one isn't reachable.
The auth rate-limit dependency is overridden off so we test the *logic* (lockout,
enumeration-safety, token single-use) rather than the IP limiter.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.rate_limit import auth_rate_limit
from app.main import app
from app.services import email_service

PASSWORD = "correct-horse-staple-12"
NEW_PASSWORD = "brand-new-staple-9876"
_TABLES = "login_attempts, email_tokens, share_snapshots, usage_counters, users"


async def _admin(sql: str):
    engine = create_async_engine(settings.alembic_url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text(sql))
            return result.all() if result.returns_rows else None
    finally:
        await engine.dispose()


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def clean_db():
    try:
        _run(_admin(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Postgres not reachable; skipping DB-backed auth tests: {exc!r}")
    # Tests target auth logic, not the IP limiter.
    app.dependency_overrides[auth_rate_limit] = lambda: None
    yield
    app.dependency_overrides.clear()
    _run(_admin(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))


@pytest.fixture
def mail(monkeypatch):
    captured: dict[str, str] = {}

    async def cap_verify(to, raw):
        captured["verify"] = raw

    async def cap_reset(to, raw):
        captured["reset"] = raw

    async def cap_exists(to):
        captured["exists"] = to

    monkeypatch.setattr(email_service, "send_verification_email", cap_verify)
    monkeypatch.setattr(email_service, "send_password_reset_email", cap_reset)
    monkeypatch.setattr(email_service, "send_account_exists_email", cap_exists)
    return captured


def _signup(client, email=" New@Example.com ", password=PASSWORD):
    return client.post("/api/auth/signup", json={"email": email, "password": password})


# --------------------------------------------------------------------------- #


def test_signup_verify_login_me(client, mail):
    r = _signup(client)
    assert r.status_code == 201
    assert r.json()["detail"]  # generic message
    assert "verify" in mail

    r = client.post("/api/auth/verify-email", json={"token": mail["verify"]})
    assert r.status_code == 200

    r = client.post(
        "/api/auth/login", json={"email": "new@example.com", "password": PASSWORD}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "new@example.com"
    assert body["email_verified"] is True

    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == "new@example.com"


def test_signup_duplicate_does_not_enumerate(client, mail):
    assert _signup(client).status_code == 201
    first_detail = _signup(client, email="new@example.com")  # different client cookie ok
    # Same generic response, and no second account created.
    assert first_detail.status_code == 201
    rows = _run(_admin("SELECT count(*) FROM users"))
    assert rows[0][0] == 1


def test_login_wrong_password_is_generic_401(client, mail):
    _signup(client)
    r = client.post(
        "/api/auth/login", json={"email": "new@example.com", "password": "wrong-password-xx"}
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid email or password."


def test_login_unknown_user_is_generic_401(client):
    r = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "whatever-1234"},
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid email or password."


def test_lockout_after_five_failures(client, mail):
    _signup(client)
    for _ in range(5):
        r = client.post(
            "/api/auth/login",
            json={"email": "new@example.com", "password": "wrong-password-xx"},
        )
        assert r.status_code == 401
    # Correct password now also fails: the account is locked.
    r = client.post(
        "/api/auth/login", json={"email": "new@example.com", "password": PASSWORD}
    )
    assert r.status_code == 401
    locked = _run(
        _admin("SELECT locked_until FROM users WHERE email = 'new@example.com'")
    )
    assert locked[0][0] is not None


def test_password_reset_for_unknown_email_is_generic(client, mail):
    r = client.post(
        "/api/auth/request-password-reset", json={"email": "ghost@example.com"}
    )
    assert r.status_code == 200
    assert "reset" not in mail  # no token minted for a non-existent account


def test_password_reset_flow(client, mail):
    _signup(client)
    assert (
        client.post(
            "/api/auth/request-password-reset", json={"email": "new@example.com"}
        ).status_code
        == 200
    )
    assert "reset" in mail

    r = client.post(
        "/api/auth/reset-password",
        json={"token": mail["reset"], "password": NEW_PASSWORD},
    )
    assert r.status_code == 200

    # New password works; old does not.
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "new@example.com", "password": NEW_PASSWORD},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": "new@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )


def test_reset_token_is_single_use(client, mail):
    _signup(client)
    client.post("/api/auth/request-password-reset", json={"email": "new@example.com"})
    token = mail["reset"]
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": token, "password": NEW_PASSWORD}
        ).status_code
        == 200
    )
    # Reusing the same token fails.
    r = client.post(
        "/api/auth/reset-password", json={"token": token, "password": "another-pass-123"}
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Invalid or expired token."


def test_invalid_reset_token_rejected(client):
    r = client.post(
        "/api/auth/reset-password",
        json={"token": "not-a-real-token", "password": NEW_PASSWORD},
    )
    assert r.status_code == 400


def test_me_requires_authentication(client):
    assert client.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected(client):
    now = datetime.now(timezone.utc)
    expired = jwt.encode(
        {
            "sub": "00000000-0000-0000-0000-000000000000",
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
        },
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    r = client.get("/api/auth/me", cookies={settings.AUTH_COOKIE_NAME: expired})
    assert r.status_code == 401


def test_malformed_signup_rejected(client):
    assert _signup(client, email="not-an-email").status_code == 422
    assert _signup(client, email="ok@example.com", password="short").status_code == 422
