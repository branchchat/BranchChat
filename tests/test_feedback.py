"""Feedback endpoint, the admin feedback list, and the engagement aggregate.

DB-backed; skips automatically when Postgres isn't reachable (test_sync pattern).
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.rate_limit import auth_rate_limit
from app.main import app
from app.services import email_service, identity

PASSWORD = "correct-horse-staple-12"
_TABLES = (
    "feedback, synced_chats, usage_counters, login_attempts, email_tokens, "
    "share_snapshots, waitlist, users"
)


async def _admin(sql: str, params: dict | None = None):
    engine = create_async_engine(settings.alembic_url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text(sql), params or {})
            return result.all() if result.returns_rows else None
    finally:
        await engine.dispose()


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def clean_db(monkeypatch):
    try:
        _run(_admin(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Postgres not reachable; skipping DB-backed tests: {exc!r}")
    app.dependency_overrides[auth_rate_limit] = lambda: None

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(email_service, "send_verification_email", _noop)
    monkeypatch.setattr(email_service, "send_account_exists_email", _noop)
    yield
    app.dependency_overrides.clear()
    _run(_admin(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))


def _signed_in_client(email: str) -> TestClient:
    client = TestClient(app)
    client.__enter__()
    assert client.post(
        "/api/auth/signup", json={"email": email, "password": PASSWORD}
    ).status_code == 201
    assert client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    ).status_code == 200
    return client


def test_feedback_requires_auth(client):
    assert client.post(
        "/api/feedback", json={"category": "idea", "message": "hi"}
    ).status_code == 401


def test_feedback_is_stored_and_readable_by_admin(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "secret-admin-token")
    c = _signed_in_client("fb@example.com")
    try:
        r = c.post(
            "/api/feedback",
            json={
                "category": "bug",
                "message": "  the branch button is stuck  ",
                "path": "/app",
                "chat_title": "Kyoto trip",
            },
        )
        assert r.status_code == 200

        admin = TestClient(app)
        admin.__enter__()
        try:
            r = admin.get(
                "/api/admin/feedback",
                headers={"X-Admin-Token": "secret-admin-token"},
            )
            assert r.status_code == 200
            items = r.json()["feedback"]
            assert len(items) == 1
            assert items[0]["email"] == "fb@example.com"
            assert items[0]["category"] == "bug"
            assert items[0]["message"] == "the branch button is stuck"  # trimmed
            # Admin API is unprobeable without the token.
            assert admin.get("/api/admin/feedback").status_code == 404
        finally:
            admin.__exit__(None, None, None)
    finally:
        c.__exit__(None, None, None)


def test_feedback_emails_founders_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "FEEDBACK_ALERT_EMAILS", ["founder@branch-chat.com"])
    captured: dict = {}

    async def cap(recipients, *, from_email, category, message):
        captured.update(
            recipients=recipients,
            from_email=from_email,
            category=category,
            message=message,
        )

    monkeypatch.setattr(email_service, "send_feedback_alert", cap)

    c = _signed_in_client("loud@example.com")
    try:
        assert c.post(
            "/api/feedback", json={"category": "idea", "message": "add dark mode"}
        ).status_code == 200
    finally:
        c.__exit__(None, None, None)

    assert captured["recipients"] == ["founder@branch-chat.com"]
    assert captured["from_email"] == "loud@example.com"
    assert captured["message"] == "add dark mode"


def test_engagement_aggregates_messages_per_account(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "secret-admin-token")
    active = _signed_in_client("active@example.com")
    _signed_in_client("idle@example.com").__exit__(None, None, None)
    try:
        # Find the active user's id and forge usage_counters rows under its
        # hash (the same opaque key the quota path writes), across two days.
        uid = _run(
            _admin("SELECT id FROM users WHERE email = 'active@example.com'")
        )[0][0]
        h = identity.user_identity(str(uid))
        _run(
            _admin(
                "INSERT INTO usage_counters (identity_hash, day, kind, count) VALUES "
                "(:h, CURRENT_DATE, 'standard', 4), "
                "(:h, CURRENT_DATE - 1, 'coding', 3)",
                {"h": h},
            )
        )

        admin = TestClient(app)
        admin.__enter__()
        try:
            r = admin.get(
                "/api/admin/engagement",
                headers={"X-Admin-Token": "secret-admin-token"},
            )
            assert r.status_code == 200
            rows = {u["email"]: u for u in r.json()["users"]}
            assert rows["active@example.com"]["total_messages"] == 7
            assert rows["active@example.com"]["active_days"] == 2
            assert rows["active@example.com"]["last_active"] is not None
            # The idle account is present with zeros, not dropped.
            assert rows["idle@example.com"]["total_messages"] == 0
            assert rows["idle@example.com"]["last_active"] is None
            # Sorted most-active first.
            assert r.json()["users"][0]["email"] == "active@example.com"
        finally:
            admin.__exit__(None, None, None)
    finally:
        active.__exit__(None, None, None)
