"""BYOK: key endpoints, chat quota bypass, and the per-user model catalog.

Same stubbing philosophy as test_chat_contract: DB/quota/rate-limit layers are
stubbed, provider validation and the request/response contracts stay real.
Vendor calls are stubbed at the byok_service boundary — no network.
"""

from __future__ import annotations

import base64
import uuid
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.routers.api_keys as keys_module
import app.routers.chat as chat_module
import app.routers.models as models_module
from app.core.config import settings
from app.core.rate_limit import ai_rate_limit, auth_rate_limit
from app.db.session import get_db
from app.main import app
from app.routers.deps import IdentityContext, current_user, request_identity
from app.schemas.chat import ChatRequest
from app.services import byok_service, chat_service, providers, sync_crypto

_USER_ID = str(uuid.uuid4())


@asynccontextmanager
async def _noop_rls(session, user_id=None):
    yield


async def _fake_db():
    yield None


def _fake_user():
    return SimpleNamespace(id=_USER_ID)


def _user_identity():
    return IdentityContext(
        user_id=_USER_ID, anon_id="anon-test", client_ip="127.0.0.1"
    )


@pytest.fixture
def keys_client(monkeypatch):
    """Authenticated /api/keys client with the DB layer stubbed out."""
    monkeypatch.setattr(keys_module, "rls_tx", _noop_rls)
    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[current_user] = _fake_user
    app.dependency_overrides[auth_rate_limit] = lambda: None
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# -- sealing ------------------------------------------------------------------


def test_seal_roundtrip_hides_the_key(monkeypatch):
    monkeypatch.setattr(
        settings,
        "SYNC_ENC_KEY",
        base64.urlsafe_b64encode(b"\x07" * 32).decode(),
    )
    sealed = sync_crypto.seal_text("sk-super-secret-1234")
    assert sealed.startswith("enc1:")
    assert "sk-super-secret-1234" not in sealed
    assert sync_crypto.unseal_text(sealed) == "sk-super-secret-1234"


def test_key_hint_is_last_four():
    assert byok_service.key_hint("sk-abcdef") == "cdef"


# -- /api/keys ----------------------------------------------------------------


def test_key_routes_require_auth():
    with TestClient(app) as client:
        assert client.get("/api/keys").status_code == 401
        assert (
            client.put(
                "/api/keys",
                json={"provider": "gemini", "api_key": "k" * 20},
            ).status_code
            == 401
        )
        assert client.delete("/api/keys/gemini").status_code == 401


def test_save_key_validates_then_stores_and_never_echoes(
    keys_client, monkeypatch
):
    secret = "AIzaSecretSecretSecret1234"
    seen: dict = {}

    async def fake_validate(provider, api_key):
        seen["args"] = (provider, api_key)

    async def fake_upsert(session, *, user_id, provider, api_key):
        seen["stored"] = (user_id, provider)

    async def fake_list(session, *, user_id):
        return [
            SimpleNamespace(
                provider="gemini",
                key_hint=secret[-4:],
                created_at="2026-07-30T00:00:00Z",
            )
        ]

    monkeypatch.setattr(keys_module.byok_service, "validate_key", fake_validate)
    monkeypatch.setattr(keys_module.byok_service, "upsert_key", fake_upsert)
    monkeypatch.setattr(keys_module.byok_service, "list_keys", fake_list)

    r = keys_client.put(
        "/api/keys", json={"provider": "gemini", "api_key": secret}
    )
    assert r.status_code == 200
    assert seen["args"] == ("gemini", secret)
    assert seen["stored"] == (_USER_ID, "gemini")
    assert r.json()["keys"][0]["key_hint"] == secret[-4:]
    assert secret not in r.text


def test_save_key_rejected_by_vendor_is_a_400(keys_client, monkeypatch):
    async def rejected(provider, api_key):
        raise byok_service.KeyRejectedError(provider)

    monkeypatch.setattr(keys_module.byok_service, "validate_key", rejected)
    r = keys_client.put(
        "/api/keys", json={"provider": "openai", "api_key": "k" * 20}
    )
    assert r.status_code == 400
    assert "k" * 20 not in r.text


def test_save_key_refused_in_prod_without_seal_key(keys_client, monkeypatch):
    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "SYNC_ENC_KEY", None)
    r = keys_client.put(
        "/api/keys", json={"provider": "gemini", "api_key": "k" * 20}
    )
    assert r.status_code == 503


def test_unknown_provider_is_a_404(keys_client):
    assert keys_client.delete("/api/keys/skynet").status_code == 404
    r = keys_client.put(
        "/api/keys", json={"provider": "skynet", "api_key": "k" * 20}
    )
    assert r.status_code == 422  # schema-level Literal


# -- chat quota bypass --------------------------------------------------------


@pytest.fixture
def chat_infra(monkeypatch):
    """Chat route with DB/beta/rate-limit stubbed and quota calls recorded."""
    charges: list[str] = []

    async def _noop_beta(session, ctx):
        return None

    async def _record_charge(session, **kwargs):
        charges.append(kwargs["kind"])

    monkeypatch.setattr(chat_module, "rls_tx", _noop_rls)
    monkeypatch.setattr(chat_module, "_require_beta_access", _noop_beta)
    monkeypatch.setattr(
        chat_module.usage_service, "enforce_message_quota", _record_charge
    )
    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[ai_rate_limit] = lambda: None
    app.dependency_overrides[request_identity] = _user_identity
    yield charges
    app.dependency_overrides.clear()


def _chat_payload() -> dict:
    return {
        "node_id": "n1",
        "message": "hello",
        "history": [],
        "linked_context": [],
        "coding_mode": False,
    }


def test_chat_with_stored_key_skips_quota(chat_infra, monkeypatch):
    generated: dict = {}

    async def fake_resolve(session, *, user_id, provider):
        assert user_id == _USER_ID
        return "user-own-key"

    async def fake_generate(*, provider_name, req, api_key_override=None):
        generated["override"] = api_key_override
        return "reply", req.model or "gemini-default"

    monkeypatch.setattr(chat_module.byok_service, "resolve_key", fake_resolve)
    monkeypatch.setattr(
        chat_module.chat_service, "generate_ai_response", fake_generate
    )

    with TestClient(app) as client:
        r = client.post("/api/chat/gemini", json=_chat_payload())

    assert r.status_code == 200
    assert generated["override"] == "user-own-key"
    assert chat_infra == []  # no quota charged


def test_chat_without_stored_key_charges_quota(chat_infra, monkeypatch):
    async def fake_resolve(session, *, user_id, provider):
        return None

    async def fake_generate(*, provider_name, req, api_key_override=None):
        assert api_key_override is None
        return "reply", "gemini-default"

    monkeypatch.setattr(chat_module.byok_service, "resolve_key", fake_resolve)
    monkeypatch.setattr(
        chat_module.chat_service, "generate_ai_response", fake_generate
    )

    with TestClient(app) as client:
        r = client.post("/api/chat/gemini", json=_chat_payload())

    assert r.status_code == 200
    assert chat_infra == ["standard"]


# -- per-user model catalog ---------------------------------------------------


def test_models_includes_byok_providers(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "house-key")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(settings, "OLLAMA_ENABLED", False)
    monkeypatch.setattr(models_module, "rls_tx", _noop_rls)

    async def fake_stored(session, *, user_id):
        return ["anthropic"]

    monkeypatch.setattr(
        models_module.byok_service, "stored_providers", fake_stored
    )
    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[request_identity] = _user_identity
    try:
        with TestClient(app) as client:
            r = client.get("/api/models")
    finally:
        app.dependency_overrides.clear()

    assert r.status_code == 200
    body = r.json()
    assert {m["provider"] for m in body["models"]} == {"gemini", "anthropic"}
    flags = {p["name"]: (p["configured"], p["byok"]) for p in body["providers"]}
    assert flags["anthropic"] == (True, True)
    assert flags["gemini"] == (True, False)
    assert flags["openai"] == (False, False)


# -- provider gate ------------------------------------------------------------


@pytest.mark.asyncio
async def test_override_satisfies_the_configured_gate(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    provider = providers.get_provider("anthropic")

    async def fake_generate(req):
        return "reply", req.model

    monkeypatch.setattr(provider, "generate", fake_generate)
    req = ChatRequest(node_id="n1", message="hi")

    # No house key and no override → 503 before any vendor call.
    with pytest.raises(HTTPException) as exc:
        await chat_service.generate_ai_response(
            provider_name="anthropic", req=req
        )
    assert exc.value.status_code == 503

    # A BYOK override alone satisfies the gate.
    reply, _ = await chat_service.generate_ai_response(
        provider_name="anthropic", req=req, api_key_override="user-key"
    )
    assert reply == "reply"
