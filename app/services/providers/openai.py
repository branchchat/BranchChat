"""OpenAI provider (Chat Completions API).

Formatting notes (all provider-internal, by design):
* System policy rides as the leading ``system`` message.
* ``max_completion_tokens`` is used (``max_tokens`` is rejected by the
  GPT-5/o-series reasoning models; the newer field is accepted across the
  models we catalogue).
* No ``temperature`` is sent — reasoning models only accept the default.
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
)

logger = logging.getLogger("branchchat.providers.openai")

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class OpenAIProvider(AIProvider):
    name = "openai"

    def is_configured(self) -> bool:
        return bool(settings.OPENAI_API_KEY)

    async def generate(self, req: GenerationRequest) -> tuple[str, str]:
        if not self.is_configured():
            raise ProviderNotConfiguredError()

        messages: list[dict] = [
            {"role": "system", "content": req.system_instruction}
        ]
        messages += [{"role": m.role, "content": m.content} for m in req.history]
        if req.attachments:
            # Images only on this API (PDFs are gated out in the service
            # layer); data URLs on the final user turn, text last.
            content: list[dict] = [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{a.media_type};base64,{a.data}"
                    },
                }
                for a in req.attachments
            ]
            content.append({"type": "text", "text": req.message})
            messages.append({"role": "user", "content": content})
        else:
            messages.append({"role": "user", "content": req.message})

        body = {
            "model": req.model,
            "messages": messages,
            "max_completion_tokens": req.max_output_tokens,
        }

        try:
            async with httpx.AsyncClient(
                timeout=settings.OPENAI_TIMEOUT_SECONDS
            ) as client:
                resp = await client.post(
                    f"{settings.OPENAI_BASE_URL}/v1/chat/completions",
                    json=body,
                    headers={
                        "Authorization": f"Bearer {settings.OPENAI_API_KEY}"
                    },
                )
        except httpx.TimeoutException as exc:
            raise ProviderUpstreamError(f"timeout: {exc}") from exc
        except httpx.HTTPError as exc:
            raise ProviderUpstreamError(f"transport: {exc}") from exc

        if resp.status_code in _RETRYABLE_STATUS:
            logger.warning("OpenAI upstream %s", resp.status_code)
            raise ProviderUpstreamError(f"status {resp.status_code}")
        if resp.status_code >= 400:
            logger.error(
                "OpenAI non-retryable %s: %s", resp.status_code, resp.text[:500]
            )
            raise ProviderRejectedError()

        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            logger.warning("OpenAI returned no choices: %s", str(data)[:300])
            return "", req.model
        text = (choices[0].get("message") or {}).get("content") or ""
        return text, req.model
