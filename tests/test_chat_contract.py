"""Contract tests for the stateless chat endpoint.

The generation, quota, and DB layers are stubbed so we assert exactly the
request/response shape the frontend depends on, without a live Postgres or
any provider key. Provider/model VALIDATION stays real (it must run before
quota is charged), so unknown-provider/model cases exercise the true path.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient

import app.routers.chat as chat_module
from app.core.config import settings
from app.core.rate_limit import ai_rate_limit
from app.db.session import get_db
from app.main import app


@asynccontextmanager
async def _noop_rls(session, user_id=None):
    yield


async def _noop_quota(session, **kwargs):
    return None


async def _fake_generate(*, provider_name, req, api_key_override=None):
    return f"echo:{req.message}", req.model or f"{provider_name}-default"


async def _fake_db():
    yield None


async def _noop_beta_gate(session, ctx):
    return None


@pytest.fixture
def stub_chat_infra(monkeypatch):
    """Stub quota/DB/rate-limit/beta-gate only — generation stays real."""
    monkeypatch.setattr(chat_module, "rls_tx", _noop_rls)
    monkeypatch.setattr(chat_module, "_require_beta_access", _noop_beta_gate)
    monkeypatch.setattr(
        chat_module.usage_service, "enforce_message_quota", _noop_quota
    )
    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[ai_rate_limit] = lambda: None
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def stub_chat(stub_chat_infra, monkeypatch):
    """Infra stubs plus a fake generator (no provider keys needed)."""
    monkeypatch.setattr(
        chat_module.chat_service, "generate_ai_response", _fake_generate
    )
    yield


def _payload(**overrides) -> dict:
    base = {
        "node_id": "node_1",
        "message": "hello",
        "history": [],
        "linked_context": [],
        "coding_mode": False,
    }
    base.update(overrides)
    return base


def test_gemini_contract_echoes_node_id_and_reply(stub_chat):
    with TestClient(app) as client:
        r = client.post("/api/chat/gemini", json=_payload())
    assert r.status_code == 200
    body = r.json()
    # Additive contract: old fields unchanged, provider/model now reported.
    assert body["node_id"] == "node_1"
    assert body["reply"] == "echo:hello"
    assert body["provider"] == "gemini"
    assert body["model"] == "gemini-default"


def test_legacy_ollama_route_still_works(stub_chat):
    with TestClient(app) as client:
        r = client.post("/api/chat/ollama", json=_payload())
    assert r.status_code == 200
    assert r.json()["provider"] == "ollama"


def test_explicit_model_is_accepted_and_echoed(stub_chat):
    with TestClient(app) as client:
        r = client.post(
            "/api/chat/gemini", json=_payload(model="gemini-2.5-pro")
        )
    assert r.status_code == 200
    assert r.json()["model"] == "gemini-2.5-pro"


def test_unknown_provider_is_404(stub_chat):
    with TestClient(app) as client:
        r = client.post("/api/chat/skynet", json=_payload())
    assert r.status_code == 404
    assert r.json()["detail"] == "Unknown AI provider."


def test_unknown_model_is_422_with_human_detail(stub_chat):
    with TestClient(app) as client:
        r = client.post(
            "/api/chat/gemini", json=_payload(model="gpt-5.2")
        )  # real model, wrong provider — must not be forwarded upstream
    assert r.status_code == 422
    assert r.json()["detail"] == "Unknown model for this provider."


def test_unconfigured_provider_is_503(stub_chat_infra, monkeypatch):
    # Real generation path: with no key the provider must answer a clean 503
    # before any upstream call is attempted.
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    with TestClient(app) as client:
        r = client.post("/api/chat/anthropic", json=_payload())
    assert r.status_code == 503
    assert r.json()["detail"] == "The AI provider is not configured."


def test_anon_cookie_is_issued(stub_chat):
    with TestClient(app) as client:
        r = client.post("/api/chat/gemini", json=_payload(message="hi"))
    assert r.status_code == 200
    assert "branchchat_anon_id" in r.cookies


def test_empty_message_is_rejected(stub_chat):
    with TestClient(app) as client:
        r = client.post("/api/chat/gemini", json=_payload(message="   "))
    assert r.status_code == 422
    assert r.json()["detail"] == "Invalid request."
