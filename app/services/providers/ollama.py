"""Ollama provider: the optional local-model path.

No API key — "configured" is governed by ``OLLAMA_ENABLED`` (whether to
advertise it in ``/api/models``). The chat route itself stays callable
regardless, preserving the original ``/api/chat/ollama`` behaviour for local
development where the frontend pins ``VITE_PROVIDER=ollama``.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings
from app.services.providers.base import (
    AIProvider,
    GenerationRequest,
    ProviderRejectedError,
    ProviderUpstreamError,
)

logger = logging.getLogger("branchchat.providers.ollama")


class OllamaProvider(AIProvider):
    name = "ollama"

    def is_configured(self) -> bool:
        return settings.OLLAMA_ENABLED

    async def generate(self, req: GenerationRequest) -> tuple[str, str]:
        messages = [{"role": "system", "content": req.system_instruction}]
        messages += [{"role": m.role, "content": m.content} for m in req.history]
        messages.append({"role": "user", "content": req.message})

        body = {"model": req.model, "messages": messages, "stream": False}

        try:
            async with httpx.AsyncClient(
                timeout=settings.OLLAMA_TIMEOUT_SECONDS
            ) as client:
                resp = await client.post(
                    f"{settings.OLLAMA_URL}/api/chat", json=body
                )
        except httpx.HTTPError as exc:
            logger.error("Ollama transport error: %s", exc)
            raise ProviderUpstreamError(
                "Could not reach the local model. Is Ollama running?"
            ) from exc

        if resp.status_code >= 400:
            logger.error("Ollama error %s: %s", resp.status_code, resp.text[:300])
            raise ProviderRejectedError("The local model returned an error.")

        data = resp.json()
        return (data.get("message") or {}).get("content", ""), req.model
