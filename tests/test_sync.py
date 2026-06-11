"""DB-backed tests for /api/sync â€” the optional chat-tree sync for signed-in users.

Requires a live Postgres (migrated through 0005). Skips automatically if one
isn't reachable. Covers the contract (manifest/get/put/delete), last-write-wins
versioning, payload/count guardrails, and â€” the part that matters â€” that one
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
            {
                "chat_id": "chat_1",
                "title": "Kyoto",
                "updated_at": 1000,
                "deleted": False,
            }
        ]

        r = c.get("/api/sync/chats/chat_1")
        assert r.status_code == 200
        body = r.json()
        assert body["payload"]["chat"]["title"] == "Kyoto"
        assert body["updated_at"] == 1000

        assert c.delete("/api/sync/chats/chat_1").status_code == 204
        assert c.get("/api/sync/chats/chat_1").status_code == 404
        # The delete is now a TOMBSTONE the manifest broadcasts (so other
        # devices drop their copies), not a vanished row.
        manifest = c.get("/api/sync/chats").json()["chats"]
        assert manifest == [
            {
                "chat_id": "chat_1",
                "title": None,
                "updated_at": 1000,
                "deleted": True,
            }
        ]
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
        # Bob can't read Alice's chat even knowing its idâ€¦
        assert b.get("/api/sync/chats/shared_id").status_code == 404
        assert b.get("/api/sync/chats").json()["chats"] == []
        # â€¦and writing the same id creates HIS row, not an overwrite of hers.
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


def test_deleted_chat_rejects_stale_repush_but_newer_resurrects():
    c = _signed_in_client("tombstone@example.com")
    try:
        c.put(
            "/api/sync/chats/chat_t",
            json={"payload": _chat_payload("v100", 100), "updated_at": 100, "title": "t"},
        )
        assert c.delete("/api/sync/chats/chat_t").status_code == 204

        # A stale offline device re-pushing the same (or older) version is the
        # resurrection bug — the tombstone must win, including on a tie.
        for stale_version in (50, 100):
            r = c.put(
                "/api/sync/chats/chat_t",
                json={
                    "payload": _chat_payload("stale", stale_version),
                    "updated_at": stale_version,
                },
            )
            assert r.status_code == 200
            assert r.json() == {"status": "deleted", "updated_at": 100}
        assert c.get("/api/sync/chats/chat_t").status_code == 404

        # A strictly newer push is real new content → resurrect (LWW).
        r = c.put(
            "/api/sync/chats/chat_t",
            json={"payload": _chat_payload("reborn", 200), "updated_at": 200, "title": "reborn"},
        )
        assert r.json() == {"status": "stored", "updated_at": 200}
        body = c.get("/api/sync/chats/chat_t").json()
        assert body["payload"]["chat"]["title"] == "reborn"
        manifest = c.get("/api/sync/chats").json()["chats"]
        assert manifest[0]["deleted"] is False
    finally:
        c.__exit__(None, None, None)


def test_tombstone_clears_conversation_data_at_rest():
    c = _signed_in_client("tombdata@example.com")
    try:
        secret = "do not keep me after deletion"
        c.put(
            "/api/sync/chats/chat_d",
            json={"payload": _chat_payload(secret, 1), "updated_at": 1, "title": secret},
        )
        assert c.delete("/api/sync/chats/chat_d").status_code == 204
        rows = _run(
            _admin(
                "SELECT payload::text, title, deleted_at FROM synced_chats "
                "WHERE chat_id = 'chat_d'"
            )
        )
        raw_payload, raw_title, deleted_at = rows[0]
        assert deleted_at is not None
        assert raw_payload == "{}"
        assert raw_title is None
    finally:
        c.__exit__(None, None, None)


def test_tombstones_do_not_count_toward_chat_cap(monkeypatch):
    monkeypatch.setattr(sync_router, "MAX_CHATS_PER_USER", 1)
    c = _signed_in_client("tombcap@example.com")
    try:
        c.put(
            "/api/sync/chats/chat_a",
            json={"payload": _chat_payload("a", 1), "updated_at": 1},
        )
        assert c.delete("/api/sync/chats/chat_a").status_code == 204
        # The tombstone is the only row; a NEW chat must still fit the cap.
        r = c.put(
            "/api/sync/chats/chat_b",
            json={"payload": _chat_payload("b", 2), "updated_at": 2},
        )
        assert r.json()["status"] == "stored"
    finally:
        c.__exit__(None, None, None)


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


def test_payloads_are_sealed_at_rest_when_key_set(monkeypatch):
    import base64
    import os

    from app.core.config import settings as cfg
    from app.services import sync_crypto

    key = base64.urlsafe_b64encode(os.urandom(32)).decode()
    monkeypatch.setattr(cfg, "SYNC_ENC_KEY", key)

    c = _signed_in_client("sealed@example.com")
    try:
        secret = "the launch codes are 0000"
        r = c.put(
            "/api/sync/chats/chat_s",
            json={
                "payload": _chat_payload(secret, 100),
                "updated_at": 100,
                "title": secret,
            },
        )
        assert r.json()["status"] == "stored"

        # The RAW row (what a dashboard/SQL viewer sees) is an opaque sealed
        # envelope - the conversation text must not appear anywhere in it,
        # including the TITLE column.
        rows = _run(
            _admin(
                "SELECT payload::text, title FROM synced_chats "
                "WHERE chat_id = 'chat_s'"
            )
        )
        raw, raw_title = rows[0]
        assert '"enc": 1' in raw or '"enc":1' in raw
        assert secret not in raw
        assert raw_title.startswith("enc1:")
        assert secret not in raw_title

        # The API round-trip still serves plaintext to the owner, manifest
        # included.
        body = c.get("/api/sync/chats/chat_s").json()
        assert body["payload"]["chat"]["title"] == secret
        assert body["title"] == secret
        manifest = c.get("/api/sync/chats").json()
        assert manifest["chats"][0]["title"] == secret

        # Sanity: seal/unseal and seal_text/unseal_text are true inverses.
        assert sync_crypto.unseal(sync_crypto.seal({"a": 1})) == {"a": 1}
        assert sync_crypto.unseal_text(sync_crypto.seal_text("hi")) == "hi"
        assert sync_crypto.seal_text(None) is None
    finally:
        c.__exit__(None, None, None)


def test_sealed_row_with_lost_key_is_410(monkeypatch):
    import base64
    import os

    from app.core.config import settings as cfg

    key = base64.urlsafe_b64encode(os.urandom(32)).decode()
    monkeypatch.setattr(cfg, "SYNC_ENC_KEY", key)

    c = _signed_in_client("rotated@example.com")
    try:
        c.put(
            "/api/sync/chats/chat_r",
            json={"payload": _chat_payload("x", 1), "updated_at": 1, "title": "x"},
        )
        # Key rotated underneath the stored row -> unreadable, clean 410.
        monkeypatch.setattr(
            cfg,
            "SYNC_ENC_KEY",
            base64.urlsafe_b64encode(os.urandom(32)).decode(),
        )
        r = c.get("/api/sync/chats/chat_r")
        assert r.status_code == 410
        assert "sync again" in r.json()["detail"]
        # The manifest must keep working (the client needs it to re-push);
        # the unreadable title degrades to null instead of erroring.
        m = c.get("/api/sync/chats")
        assert m.status_code == 200
        assert m.json()["chats"][0]["title"] is None
    finally:
        c.__exit__(None, None, None)

