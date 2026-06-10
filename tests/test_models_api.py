"""Tests for the model registry + recommendation endpoints.

Provider availability is driven by settings keys, so these monkeypatch the
settings singleton — no network, no DB.
"""

from __future__ import annotations

import pytest

from app.core.config import settings


@pytest.fixture
def two_providers(monkeypatch):
    """Gemini + Anthropic configured; OpenAI and Ollama not."""
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-anthropic-key")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)
    monkeypatch.setattr(settings, "OLLAMA_ENABLED", False)


def test_models_lists_only_configured_providers(client, two_providers):
    r = client.get("/api/models")
    assert r.status_code == 200
    body = r.json()

    providers_in_models = {m["provider"] for m in body["models"]}
    assert providers_in_models == {"gemini", "anthropic"}

    flags = {p["name"]: p["configured"] for p in body["providers"]}
    assert flags == {
        "gemini": True,
        "openai": False,
        "anthropic": True,
        "ollama": False,
    }

    # Exactly one default per configured provider, and full metadata present.
    for provider in ("gemini", "anthropic"):
        defaults = [
            m
            for m in body["models"]
            if m["provider"] == provider and m["is_default"]
        ]
        assert len(defaults) == 1
    sample = body["models"][0]
    for field in ("label", "description", "context_window", "badges", "speed"):
        assert field in sample


def test_models_response_never_contains_key_material(client, two_providers):
    r = client.get("/api/models")
    assert "test-gemini-key" not in r.text
    assert "test-anthropic-key" not in r.text


def test_recommend_ranks_coding_models_for_coding_tasks(client, two_providers):
    r = client.post(
        "/api/models/recommend",
        json={
            "message": "Help me debug this Python function, it throws an error",
            "coding_mode": False,
        },
    )
    assert r.status_code == 200
    recs = r.json()["recommendations"]
    assert recs, "expected recommendations for configured providers"

    # Only configured providers may be recommended.
    assert {rec["provider"] for rec in recs} <= {"gemini", "anthropic"}
    # Ranked best-first with explanations.
    scores = [rec["score"] for rec in recs]
    assert scores == sorted(scores, reverse=True)
    assert all(0.0 <= s <= 1.0 for s in scores)
    assert recs[0]["task"] == "coding"
    assert "coding" in recs[0]["reason"].lower()
    assert all(rec["reason"] for rec in recs)


def test_recommend_cost_preference_boosts_cheap_models(client, two_providers):
    def top_model(preference):
        r = client.post(
            "/api/models/recommend",
            json={"message": "tell me about kyoto", "preference": preference},
        )
        assert r.status_code == 200
        return r.json()["recommendations"][0]

    assert top_model("cost")["model"] != top_model("quality")["model"]


def test_recommend_works_with_no_providers_configured(client, monkeypatch):
    for key in ("GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.setattr(settings, key, None)
    monkeypatch.setattr(settings, "OLLAMA_ENABLED", False)

    r = client.post("/api/models/recommend", json={"message": "hello"})
    assert r.status_code == 200
    assert r.json()["recommendations"] == []

    r = client.get("/api/models")
    assert r.status_code == 200
    assert r.json()["models"] == []
