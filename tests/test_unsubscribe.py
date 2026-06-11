"""Unsubscribe tokens, the public opt-out endpoint, and the launch broadcast.

The token round-trip + the email assembly are pure unit tests (no DB). The
endpoint and admin-broadcast tests are DB-backed and skip automatically when
Postgres isn't reachable (same pattern as test_sync).
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app
from app.routers import admin as admin_router
from app.services import email_service
from app.services import unsubscribe as unsub


# --- pure token unit tests (no DB) ------------------------------------------ #


def test_token_round_trip_is_case_insensitive():
    token = unsub.make_token("Tester@Example.com")
    assert unsub.verify_token(token) == "tester@example.com"


def test_tampered_or_junk_token_is_rejected():
    token = unsub.make_token("tester@example.com")
    body, sig = token.split(".", 1)
    # Swap the payload to a different address, keep the old signature.
    forged = unsub.make_token("victim@example.com").split(".", 1)[0] + "." + sig
    assert unsub.verify_token(forged) is None
    assert unsub.verify_token("not-a-token") is None
    assert unsub.verify_token("") is None


def test_launch_email_carries_unsubscribe_link_and_header(monkeypatch):
    captured: dict = {}

    async def _capture(to, subject, html, *, headers=None):
        captured.update(to=to, subject=subject, html=html, headers=headers)

    monkeypatch.setattr(email_service, "_send", _capture)
    url = unsub.unsubscribe_url("tester@example.com")
    asyncio.run(
        email_service.send_launch_announcement("tester@example.com", unsubscribe_url=url)
    )

    assert captured["to"] == "tester@example.com"
    # Footer link + one-click header both present and pointing at the same URL.
    assert url in captured["html"]
    assert captured["headers"]["List-Unsubscribe"] == f"<{url}>"
    assert captured["headers"]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    # It's the launch copy, not a transactional template.
    assert "Claim your beta spot" in captured["html"]
    assert "branch-chat.com/beta" in captured["html"]


# --- DB-backed endpoint + broadcast tests ----------------------------------- #

_TABLES = "synced_chats, login_attempts, email_tokens, share_snapshots, usage_counters, waitlist, users"


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
def clean_db():
    try:
        _run(_admin(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Postgres not reachable; skipping DB-backed tests: {exc!r}")
    yield
    _run(_admin(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))


def _seed_waitlist(*emails: str) -> None:
    for email in emails:
        _run(
            _admin(
                "INSERT INTO waitlist (email, source) VALUES (:e, 'beta')",
                {"e": email},
            )
        )


def _unsubscribed_at(email: str):
    rows = _run(
        _admin(
            "SELECT unsubscribed_at FROM waitlist WHERE email = :e", {"e": email}
        )
    )
    return rows[0][0] if rows else None


def test_get_unsubscribe_sets_flag_and_is_idempotent():
    _seed_waitlist("optout@example.com")
    token = unsub.make_token("optout@example.com")
    with TestClient(app) as c:
        r = c.get(f"/api/unsubscribe?token={token}")
        assert r.status_code == 200
        assert "unsubscribed" in r.text.lower()
        first = _unsubscribed_at("optout@example.com")
        assert first is not None

        # Re-clicking keeps the original timestamp (the UPDATE only fires when null).
        r = c.get(f"/api/unsubscribe?token={token}")
        assert r.status_code == 200
        assert _unsubscribed_at("optout@example.com") == first


def test_get_unsubscribe_bad_token_changes_nothing():
    _seed_waitlist("safe@example.com")
    with TestClient(app) as c:
        r = c.get("/api/unsubscribe?token=garbage")
        assert r.status_code == 400
    assert _unsubscribed_at("safe@example.com") is None


def test_one_click_post_unsubscribes():
    _seed_waitlist("oneclick@example.com")
    token = unsub.make_token("oneclick@example.com")
    with TestClient(app) as c:
        r = c.post(f"/api/unsubscribe?token={token}")
        assert r.status_code == 200
    assert _unsubscribed_at("oneclick@example.com") is not None


def test_broadcast_requires_admin_token(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "secret-admin-token")
    with TestClient(app) as c:
        # No token → unprobeable 404.
        assert c.post("/api/admin/broadcast/launch", json={}).status_code == 404
        # Wrong token → 404.
        r = c.post(
            "/api/admin/broadcast/launch",
            json={},
            headers={"X-Admin-Token": "wrong"},
        )
        assert r.status_code == 404


def test_broadcast_dry_run_counts_only_subscribed(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "secret-admin-token")
    _seed_waitlist("a@example.com", "b@example.com", "c@example.com")
    # c has opted out → excluded from the count.
    _run(
        _admin(
            "UPDATE waitlist SET unsubscribed_at = now() WHERE email = 'c@example.com'"
        )
    )
    with TestClient(app) as c:
        r = c.post(
            "/api/admin/broadcast/launch",
            json={"dry_run": True},
            headers={"X-Admin-Token": "secret-admin-token"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["dry_run"] is True
    assert body["recipients"] == 2
    assert "c@example.com" not in body["sample"]
    # The pre-flight origin is surfaced and built from a placeholder (never a
    # real recipient's token).
    assert "/api/unsubscribe?token=" in body["unsubscribe_origin"]
    for real in ("a@example.com", "b@example.com"):
        assert unsub.make_token(real).split(".", 1)[1] not in body["unsubscribe_origin"]


def test_broadcast_send_emails_each_subscribed_recipient(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_TOKEN", "secret-admin-token")
    monkeypatch.setattr(admin_router, "_BROADCAST_DELAY_SECONDS", 0)
    _seed_waitlist("x@example.com", "y@example.com")

    sent: list[tuple[str, str]] = []

    async def _capture(to, *, unsubscribe_url):
        sent.append((to, unsubscribe_url))

    monkeypatch.setattr(email_service, "send_launch_announcement", _capture)

    with TestClient(app) as c:
        r = c.post(
            "/api/admin/broadcast/launch",
            json={"dry_run": False},
            headers={"X-Admin-Token": "secret-admin-token"},
        )
    assert r.status_code == 200
    assert r.json()["recipients"] == 2
    # TestClient runs the BackgroundTask before returning; each recipient got a
    # send with their own valid unsubscribe link.
    assert {to for to, _ in sent} == {"x@example.com", "y@example.com"}
    for to, url in sent:
        assert unsub.verify_token(url.split("token=", 1)[1]) == to
