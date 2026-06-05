"""Contract tests for the stateless chat endpoint.

The provider, quota, and DB layers are stubbed so we assert exactly the
request/response shape the frontend depends on, without a live Postgres/Gemini.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient

import app.routers.chat as chat_module
from app.core.rate_limit import ai_rate_limit
from app.db.session import get_db
from app.main import app


@asynccontextmanager
async def _noop_rls(session, user_id=None):
    yield


async def _noop_quota(session, **kwargs):
    return None


async def _fake_reply(req):
    return f"echo:{req.message}"


async def _fake_db():
    yield None


@pytest.fixture
def stub_chat(monkeypatch):
    monkeypatch.setattr(chat_module, "rls_tx", _noop_rls)
    monkeypatch.setattr(
        chat_module.usage_service, "enforce_message_quota", _noop_quota
    )
    monkeypatch.setattr(chat_module.gemini_service, "generate_reply", _fake_reply)
    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[ai_rate_limit] = lambda: None
    yield
    app.dependency_overrides.clear()


def test_gemini_contract_echoes_node_id_and_reply(stub_chat):
    with TestClient(app) as client:
        r = client.post(
            "/api/chat/gemini",
            json={
                "node_id": "node_1",
                "message": "hello",
                "history": [],
                "linked_context": [],
                "coding_mode": False,
            },
        )
    assert r.status_code == 200
    body = r.json()
    assert body == {"node_id": "node_1", "reply": "echo:hello"}


def test_anon_cookie_is_issued(stub_chat):
    with TestClient(app) as client:
        r = client.post(
            "/api/chat/gemini",
            json={
                "node_id": "n",
                "message": "hi",
                "history": [],
                "linked_context": [],
                "coding_mode": False,
            },
        )
    assert r.status_code == 200
    assert "branchchat_anon_id" in r.cookies


def test_empty_message_is_rejected(stub_chat):
    with TestClient(app) as client:
        r = client.post(
            "/api/chat/gemini",
            json={
                "node_id": "n",
                "message": "   ",
                "history": [],
                "linked_context": [],
                "coding_mode": False,
            },
        )
    assert r.status_code == 422
    assert r.json()["detail"] == "Invalid request."
