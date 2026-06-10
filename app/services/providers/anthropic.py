"""Anthropic provider (Messages API).

Formatting notes (all provider-internal, by design):
* The system policy goes in the top-level ``system`` field, not the messages.
* The Messages API hard-requires a user-first, strictly alternating
  transcript, so client history goes through ``merge_alternating`` first.
* ``max_tokens`` is mandatory on this API.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings
from app.services.providers.base import (
    AIProvider,
    GenerationRequest,
    ProviderNotConfiguredError,
    ProviderRejectedError,
    ProviderUpstreamError,
    merge_alternating,
)

logger = logging.getLogger("branchchat.providers.anthropic")

_RETRYABLE_STATUS = {429, 500, 502, 503, 504, 529}  # 529 = Anthropic "overloaded"
_API_VERSION = "2023-06-01"


class AnthropicProvider(AIProvider):
    name = "anthropic"

    def is_configured(self) -> bool:
        return bool(settings.ANTHROPIC_API_KEY)

    async def generate(self, req: GenerationRequest) -> tuple[str, str]:
        if not self.is_configured():
            raise ProviderNotConfiguredError()

        history = merge_alternating(req.history)
        messages = [{"role": m.role, "content": m.content} for m in history]
        messages.append({"role": "user", "content": req.message})

        body = {
            "model": req.model,
            "system": req.system_instruction,
            "messages": messages,
            "max_tokens": req.max_output_tokens,
        }

        try:
            async with httpx.AsyncClient(
                timeout=settings.ANTHROPIC_TIMEOUT_SECONDS
            ) as client:
                resp = await client.post(
                    f"{settings.ANTHROPIC_BASE_URL}/v1/messages",
                    json=body,
                    headers={
                        "x-api-key": settings.ANTHROPIC_API_KEY or "",
                        "anthropic-version": _API_VERSION,
                    },
                )
        except httpx.TimeoutException as exc:
            raise ProviderUpstreamError(f"timeout: {exc}") from exc
        except httpx.HTTPError as exc:
            raise ProviderUpstreamError(f"transport: {exc}") from exc

        if resp.status_code in _RETRYABLE_STATUS:
            logger.warning("Anthropic upstream %s", resp.status_code)
            raise ProviderUpstreamError(f"status {resp.status_code}")
        if resp.status_code >= 400:
            logger.error(
                "Anthropic non-retryable %s: %s", resp.status_code, resp.text[:500]
            )
            raise ProviderRejectedError()

        data = resp.json()
        blocks = data.get("content") or []
        text = "".join(
            b.get("text", "") for b in blocks if b.get("type") == "text"
        )
        return text, req.model
