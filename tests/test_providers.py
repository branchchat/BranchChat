"""Unit tests for the provider registry, catalog resolution, and the
history-shape helper vendors with strict transcript rules rely on."""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.schemas.chat import ProviderMessage
from app.services import model_catalog, providers
from app.services.providers.base import merge_alternating


def _msg(role: str, content: str) -> ProviderMessage:
    return ProviderMessage(role=role, content=content)


# -- registry ----------------------------------------------------------------


def test_registry_knows_all_providers():
    assert set(providers.provider_names()) == {
        "gemini",
        "openai",
        "anthropic",
        "ollama",
    }
    assert providers.get_provider("gemini") is not None
    assert providers.get_provider("skynet") is None


def test_configured_follows_settings(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "k")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    assert providers.get_provider("openai").is_configured() is True
    assert providers.get_provider("anthropic").is_configured() is False


# -- catalog / model resolution ------------------------------------------------


def test_resolve_model_defaults_to_provider_default():
    assert (
        model_catalog.resolve_model("gemini", None) == settings.GEMINI_MODEL
    )
    assert (
        model_catalog.resolve_model("anthropic", "")
        == settings.ANTHROPIC_MODEL
    )


def test_resolve_model_accepts_catalogued_ids_only():
    assert (
        model_catalog.resolve_model("gemini", "gemini-2.5-pro")
        == "gemini-2.5-pro"
    )
    with pytest.raises(model_catalog.UnknownModelError):
        model_catalog.resolve_model("gemini", "gpt-5.2")  # wrong provider
    with pytest.raises(model_catalog.UnknownModelError):
        model_catalog.resolve_model("openai", "totally-made-up")


def test_every_catalog_model_belongs_to_a_registered_provider():
    names = set(providers.provider_names())
    for model in model_catalog.all_models():
        assert model.provider in names


# -- transcript shaping --------------------------------------------------------


def test_merge_alternating_merges_consecutive_same_role():
    merged = merge_alternating(
        [
            _msg("user", "a"),
            _msg("user", "b"),
            _msg("assistant", "c"),
            _msg("assistant", "d"),
            _msg("user", "e"),
        ]
    )
    assert [(m.role, m.content) for m in merged] == [
        ("user", "a\n\nb"),
        ("assistant", "c\n\nd"),
        ("user", "e"),
    ]


def test_merge_alternating_drops_leading_assistant():
    merged = merge_alternating(
        [_msg("assistant", "orphaned by truncation"), _msg("user", "q")]
    )
    assert [(m.role, m.content) for m in merged] == [("user", "q")]


def test_merge_alternating_handles_empty():
    assert merge_alternating([]) == []
