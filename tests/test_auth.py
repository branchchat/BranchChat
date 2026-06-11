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

    async def cap_alert(new_email, recipients):
        captured["alert"] = (new_email, list(recipients))

    monkeypatch.setattr(email_service, "send_verification_email", cap_verify)
    monkeypatch.setattr(email_service, "send_password_reset_email", cap_reset)
    monkeypatch.setattr(email_service, "send_account_exists_email", cap_exists)
    monkeypatch.setattr(email_service, "send_new_signup_alert", cap_alert)
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


def test_signup_alerts_founders_when_configured(client, mail, monkeypatch):
    monkeypatch.setattr(settings, "SIGNUP_ALERT_EMAILS", ["founder@branch-chat.com"])
    assert _signup(client).status_code == 201
    # The founder alert fired with the new address + configured recipients.
    assert mail["alert"] == ("new@example.com", ["founder@branch-chat.com"])


def test_signup_no_alert_when_unconfigured(client, mail, monkeypatch):
    monkeypatch.setattr(settings, "SIGNUP_ALERT_EMAILS", [])
    assert _signup(client).status_code == 201
    assert "verify" in mail  # the user still gets their verification email
    assert "alert" not in mail


def test_duplicate_signup_does_not_alert(client, mail, monkeypatch):
    monkeypatch.setattr(settings, "SIGNUP_ALERT_EMAILS", ["founder@branch-chat.com"])
    assert _signup(client).status_code == 201
    mail.pop("alert", None)
    # A repeat signup with the same email is the "already registered" branch —
    # no new account, so no founder alert (and no enumeration signal).
    assert _signup(client, email="new@example.com").status_code == 201
    assert "alert" not in mail
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


def test_password_reset_invalidates_existing_sessions(client, mail):
    """A stolen session cookie must die when the owner resets their password."""
    import time

    _signup(client)
    r = client.post(
        "/api/auth/login", json={"email": "new@example.com", "password": PASSWORD}
    )
    assert r.status_code == 200
    assert client.get("/api/auth/me").status_code == 200

    # Cross a whole-second boundary: revocation compares the token's iat
    # (second resolution) against password_changed_at.
    time.sleep(1.1)

    client.post("/api/auth/request-password-reset", json={"email": "new@example.com"})
    assert (
        client.post(
            "/api/auth/reset-password",
            json={"token": mail["reset"], "password": NEW_PASSWORD},
        ).status_code
        == 200
    )

    # The pre-reset session cookie is still in the jar — now rejected.
    assert client.get("/api/auth/me").status_code == 401

    # Logging in with the new password issues a fresh, working session.
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "new@example.com", "password": NEW_PASSWORD},
        ).status_code
        == 200
    )
    assert client.get("/api/auth/me").status_code == 200


def test_ip_throttle_after_spraying_many_accounts(client, mail, monkeypatch):
    """Failures across DIFFERENT accounts from one source trip the durable
    DB-backed throttle — and the response stays the generic 401."""
    monkeypatch.setattr(settings, "LOGIN_IP_MAX_FAILED", 3)

    _signup(client)  # the real account the attacker eventually guesses right on
    for i in range(3):
        r = client.post(
            "/api/auth/login",
            json={"email": f"ghost{i}@example.com", "password": "wrong-pass-1234"},
        )
        assert r.status_code == 401

    # Correct credentials, but the source is throttled: same generic failure.
    r = client.post(
        "/api/auth/login", json={"email": "new@example.com", "password": PASSWORD}
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid email or password."

    # The brake is the durable table, not process memory: clearing it (as the
    # window expiring would) restores access for the legitimate user.
    _run(_admin("TRUNCATE login_attempts"))
    r = client.post(
        "/api/auth/login", json={"email": "new@example.com", "password": PASSWORD}
    )
    assert r.status_code == 200


def test_stale_login_attempts_pruned_on_successful_login(client, mail):
    """Audit rows past LOGIN_ATTEMPTS_RETENTION_DAYS are swept by a successful
    login; rows inside the window (throttle evidence) are kept."""
    _signup(client)
    _run(
        _admin(
            "INSERT INTO login_attempts (identifier, scope, success, created_at) VALUES "
            "('stale-row-hash', 'ip', false, now() - interval '40 days'), "
            "('fresh-row-hash', 'ip', false, now() - interval '1 hour')"
        )
    )

    r = client.post(
        "/api/auth/login", json={"email": "new@example.com", "password": PASSWORD}
    )
    assert r.status_code == 200

    rows = _run(
        _admin(
            "SELECT identifier FROM login_attempts "
            "WHERE identifier IN ('stale-row-hash', 'fresh-row-hash')"
        )
    )
    kept = {row[0] for row in rows}
    assert "stale-row-hash" not in kept
    assert "fresh-row-hash" in kept


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
