"""Provider registry.

Adding a vendor is: write an ``AIProvider`` subclass next to the existing
ones, instantiate it in ``_PROVIDERS``, and add its models to
``model_catalog``. Nothing else in the app changes — the chat route, quota,
recommendations, and the frontend picker all key off this registry.
"""

from __future__ import annotations

from app.services.providers.anthropic import AnthropicProvider
from app.services.providers.base import (
    AIProvider,
    GenerationRequest,
    ProviderNotConfiguredError,
    ProviderRejectedError,
    ProviderUpstreamError,
)
from app.services.providers.gemini import GeminiProvider
from app.services.providers.ollama import OllamaProvider
from app.services.providers.openai import OpenAIProvider

_PROVIDERS: dict[str, AIProvider] = {
    provider.name: provider
    for provider in (
        GeminiProvider(),
        OpenAIProvider(),
        AnthropicProvider(),
        OllamaProvider(),
    )
}


def get_provider(name: str) -> AIProvider | None:
    return _PROVIDERS.get(name)


def provider_names() -> list[str]:
    return list(_PROVIDERS)


def configured_provider_names() -> list[str]:
    return [name for name, p in _PROVIDERS.items() if p.is_configured()]


__all__ = [
    "AIProvider",
    "GenerationRequest",
    "ProviderNotConfiguredError",
    "ProviderRejectedError",
    "ProviderUpstreamError",
    "get_provider",
    "provider_names",
    "configured_provider_names",
]
