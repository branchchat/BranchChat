"""DB-backed tests for the private-beta gate and the admin approval API.

Requires a live Postgres (migrated through 0006). Skips automatically if one
isn't reachable. Covers: anonymous/unapproved callers can never reach a
provider (the token-burn fix), the admin API is invisible without the token,
and approve/revoke round-trips including the approval email.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

import app.routers.chat as chat_module
from app.core.config import settings
from app.core.rate_limit import ai_rate_limit, auth_rate_limit
from app.main import app
from app.services import email_service

PASSWORD = "correct-horse-staple-12"
_TABLES = "synced_chats, login_attempts, email_tokens, share_snapshots, usage_counters, users"
ADMIN_TOKEN = "test-admin-token-long-enough-000"


async def _admin_sql(sql: str):
    engine = create_async_engine(settings.alembic_url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text(sql))
            return result.all() if result.returns_rows else None
    finally:
        await engine.dispose()


def _run(coro):
    return asyncio.run(coro)


async def _fake_generate(*, provider_name, req):
    return f"echo:{req.message}", req.model or f"{provider_name}-default"


@pytest.fixture(autouse=True)
def clean_db(monkeypatch):
    try:
        _run(_admin_sql(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Postgres not reachable; skipping beta-access tests: {exc!r}")
    app.dependency_overrides[auth_rate_limit] = lambda: None
    app.dependency_overrides[ai_rate_limit] = lambda: None
    # Generation is faked (no provider keys); the gate itself stays REAL.
    monkeypatch.setattr(
        chat_module.chat_service, "generate_ai_response", _fake_generate
    )

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(email_service, "send_verification_email", _noop)
    monkeypatch.setattr(email_service, "send_account_exists_email", _noop)
    yield
    app.dependency_overrides.clear()
    _run(_admin_sql(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))


@pytest.fixture
def admin_token(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_TOKEN", ADMIN_TOKEN)
    return ADMIN_TOKEN


def _signed_in_client(email: str) -> TestClient:
    client = TestClient(app)
    client.__enter__()
    assert (
        client.post(
            "/api/auth/signup", json={"email": email, "password": PASSWORD}
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/auth/login", json={"email": email, "password": PASSWORD}
        ).status_code
        == 200
    )
    return client


def _chat_payload() -> dict:
    return {"node_id": "n1", "message": "hello", "history": []}


# --------------------------------------------------------------------------- #


def test_anonymous_chat_is_blocked(client):
    r = client.post("/api/chat/gemini", json=_chat_payload())
    assert r.status_code == 403
    assert "private beta" in r.json()["detail"].lower()


def test_expired_session_gets_401_sign_in_again_not_the_anon_copy(client):
    # An auth cookie that no longer decodes (expired/garbage token) means the
    # caller WAS signed in — they must hear "sign in again" (401, so the
    # frontend pops the auth dialog), never "create an account".
    client.cookies.set(settings.AUTH_COOKIE_NAME, "expired-or-garbage")
    r = client.post("/api/chat/gemini", json=_chat_payload())
    assert r.status_code == 401
    assert "session has expired" in r.json()["detail"].lower()
    assert "create an account" not in r.json()["detail"].lower()


def test_unapproved_account_is_blocked_then_approved_can_chat(
    admin_token, monkeypatch
):
    approved_emails: list[str] = []

    async def cap_approval(to):
        approved_emails.append(to)

    monkeypatch.setattr(
        email_service, "send_beta_approved_email", cap_approval
    )

    c = _signed_in_client("tester@example.com")
    try:
        # Signed in but unapproved → blocked, nothing charged.
        r = c.post("/api/chat/gemini", json=_chat_payload())
        assert r.status_code == 403
        assert "awaiting beta approval" in r.json()["detail"]

        # Admin approves → approval email sent.
        r = c.post(
            "/api/admin/beta/approve",
            json={"email": "Tester@Example.com"},
            headers={"X-Admin-Token": ADMIN_TOKEN},
        )
        assert r.status_code == 200
        assert approved_emails == ["tester@example.com"]

        # /me reflects the flag; chat now works.
        assert c.get("/api/auth/me").json()["is_beta_tester"] is True
        r = c.post("/api/chat/gemini", json=_chat_payload())
        assert r.status_code == 200
        assert r.json()["reply"] == "echo:hello"

        # Revoke → blocked again.
        c.post(
            "/api/admin/beta/revoke",
            json={"email": "tester@example.com"},
            headers={"X-Admin-Token": ADMIN_TOKEN},
        )
        assert c.post("/api/chat/gemini", json=_chat_payload()).status_code == 403
    finally:
        c.__exit__(None, None, None)


def test_admin_api_is_invisible_without_valid_token(admin_token, client):
    # Wrong token → 404, not 401/403 (unprobeable surface).
    r = client.get(
        "/api/admin/beta/pending", headers={"X-Admin-Token": "wrong"}
    )
    assert r.status_code == 404
    assert client.get("/api/admin/beta/pending").status_code == 404


def test_admin_api_disabled_when_token_unset(monkeypatch, client):
    monkeypatch.setattr(settings, "ADMIN_API_TOKEN", None)
    r = client.get(
        "/api/admin/beta/pending", headers={"X-Admin-Token": ""}
    )
    assert r.status_code == 404


def test_pending_list_shows_unapproved_only(admin_token):
    a = _signed_in_client("pending@example.com")
    b = _signed_in_client("approved@example.com")
    try:
        a.post(
            "/api/admin/beta/approve",
            json={"email": "approved@example.com"},
            headers={"X-Admin-Token": ADMIN_TOKEN},
        )
        r = a.get(
            "/api/admin/beta/pending", headers={"X-Admin-Token": ADMIN_TOKEN}
        )
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()["pending"]]
        assert emails == ["pending@example.com"]
    finally:
        a.__exit__(None, None, None)
        b.__exit__(None, None, None)


def test_approve_unknown_email_is_404(admin_token, client):
    r = client.post(
        "/api/admin/beta/approve",
        json={"email": "ghost@example.com"},
        headers={"X-Admin-Token": ADMIN_TOKEN},
    )
    assert r.status_code == 404
    assert "No account" in r.json()["detail"]
