"""DB-backed tests for /api/sync — the optional chat-tree sync for signed-in users.

Requires a live Postgres (migrated through 0005). Skips automatically if one
isn't reachable. Covers the contract (manifest/get/put/delete), last-write-wins
versioning, payload/count guardrails, and — the part that matters — that one
user can never see another user's chats even with a guessed chat id.
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
from app.routers import sync as sync_router
from app.services import email_service

PASSWORD = "correct-horse-staple-12"
_TABLES = "synced_chats, login_attempts, email_tokens, share_snapshots, usage_counters, users"


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
def clean_db(monkeypatch):
    try:
        _run(_admin(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Postgres not reachable; skipping DB-backed sync tests: {exc!r}")
    app.dependency_overrides[auth_rate_limit] = lambda: None

    # Emails aren't under test; swallow them.
    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(email_service, "send_verification_email", _noop)
    monkeypatch.setattr(email_service, "send_password_reset_email", _noop)
    monkeypatch.setattr(email_service, "send_account_exists_email", _noop)
    yield
    app.dependency_overrides.clear()
    _run(_admin(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))


def _signed_in_client(email: str) -> TestClient:
    client = TestClient(app)
    client.__enter__()
    r = client.post("/api/auth/signup", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200
    return client


def _chat_payload(title: str, updated_at: int) -> dict:
    # A miniature of the frontend's branchchat-session v1 envelope; the backend
    # treats it opaquely, so shape only matters to the frontend.
    return {
        "kind": "branchchat-session",
        "version": 1,
        "chat": {"title": title, "updatedAt": updated_at, "nodes": {}},
    }


# --------------------------------------------------------------------------- #


def test_sync_requires_auth(client):
    assert client.get("/api/sync/chats").status_code == 401
    assert client.get("/api/sync/chats/abc").status_code == 401
    assert (
        client.put(
            "/api/sync/chats/abc", json={"payload": {}, "updated_at": 1}
        ).status_code
        == 401
    )
    assert client.delete("/api/sync/chats/abc").status_code == 401


def test_put_get_manifest_delete_roundtrip():
    c = _signed_in_client("sync1@example.com")
    try:
        r = c.put(
            "/api/sync/chats/chat_1",
            json={
                "payload": _chat_payload("Kyoto", 1000),
                "updated_at": 1000,
                "title": "Kyoto",
            },
        )
        assert r.status_code == 200
        assert r.json() == {"status": "stored", "updated_at": 1000}

        r = c.get("/api/sync/chats")
        assert r.status_code == 200
        assert r.json()["chats"] == [
            {"chat_id": "chat_1", "title": "Kyoto", "updated_at": 1000}
        ]

        r = c.get("/api/sync/chats/chat_1")
        assert r.status_code == 200
        body = r.json()
        assert body["payload"]["chat"]["title"] == "Kyoto"
        assert body["updated_at"] == 1000

        assert c.delete("/api/sync/chats/chat_1").status_code == 204
        assert c.get("/api/sync/chats/chat_1").status_code == 404
        assert c.get("/api/sync/chats").json()["chats"] == []
    finally:
        c.__exit__(None, None, None)


def test_last_write_wins_rejects_stale_push():
    c = _signed_in_client("sync2@example.com")
    try:
        c.put(
            "/api/sync/chats/chat_1",
            json={"payload": _chat_payload("v2", 2000), "updated_at": 2000},
        )
        r = c.put(
            "/api/sync/chats/chat_1",
            json={"payload": _chat_payload("v1", 1000), "updated_at": 1000},
        )
        assert r.status_code == 200
        assert r.json() == {"status": "stale", "updated_at": 2000}

        # Server copy untouched.
        body = c.get("/api/sync/chats/chat_1").json()
        assert body["updated_at"] == 2000
        assert body["payload"]["chat"]["title"] == "v2"

        # Equal version is accepted (idempotent re-push).
        r = c.put(
            "/api/sync/chats/chat_1",
            json={"payload": _chat_payload("v2b", 2000), "updated_at": 2000},
        )
        assert r.json()["status"] == "stored"
    finally:
        c.__exit__(None, None, None)


def test_users_are_isolated_even_with_guessed_ids():
    a = _signed_in_client("alice@example.com")
    b = _signed_in_client("bob@example.com")
    try:
        a.put(
            "/api/sync/chats/shared_id",
            json={"payload": _chat_payload("alice", 1), "updated_at": 1, "title": "alice"},
        )
        # Bob can't read Alice's chat even knowing its id…
        assert b.get("/api/sync/chats/shared_id").status_code == 404
        assert b.get("/api/sync/chats").json()["chats"] == []
        # …and writing the same id creates HIS row, not an overwrite of hers.
        b.put(
            "/api/sync/chats/shared_id",
            json={"payload": _chat_payload("bob", 9), "updated_at": 9, "title": "bob"},
        )
        assert a.get("/api/sync/chats/shared_id").json()["payload"]["chat"]["title"] == "alice"
        # Bob deleting "shared_id" only deletes his copy.
        assert b.delete("/api/sync/chats/shared_id").status_code == 204
        assert a.get("/api/sync/chats/shared_id").status_code == 200
    finally:
        a.__exit__(None, None, None)
        b.__exit__(None, None, None)


def test_invalid_chat_id_rejected():
    c = _signed_in_client("sync3@example.com")
    try:
        r = c.put(
            "/api/sync/chats/bad!id",
            json={"payload": {}, "updated_at": 1},
        )
        assert r.status_code == 422
        # An id long enough to pass routing but over the 64-char cap.
        r = c.get(f"/api/sync/chats/{'a' * 65}")
        assert r.status_code == 422
    finally:
        c.__exit__(None, None, None)


def test_oversized_payload_rejected(monkeypatch):
    monkeypatch.setattr(sync_router, "MAX_PAYLOAD_BYTES", 100)
    c = _signed_in_client("sync4@example.com")
    try:
        r = c.put(
            "/api/sync/chats/chat_1",
            json={"payload": {"blob": "x" * 200}, "updated_at": 1},
        )
        assert r.status_code == 413
    finally:
        c.__exit__(None, None, None)


def test_chat_count_cap(monkeypatch):
    monkeypatch.setattr(sync_router, "MAX_CHATS_PER_USER", 2)
    c = _signed_in_client("sync5@example.com")
    try:
        for i in range(2):
            r = c.put(
                f"/api/sync/chats/chat_{i}",
                json={"payload": _chat_payload(str(i), i + 1), "updated_at": i + 1},
            )
            assert r.json()["status"] == "stored"
        r = c.put(
            "/api/sync/chats/chat_overflow",
            json={"payload": _chat_payload("x", 99), "updated_at": 99},
        )
        assert r.status_code == 409
        # Updating an EXISTING chat still works at the cap.
        r = c.put(
            "/api/sync/chats/chat_0",
            json={"payload": _chat_payload("updated", 100), "updated_at": 100},
        )
        assert r.json()["status"] == "stored"
    finally:
        c.__exit__(None, None, None)
