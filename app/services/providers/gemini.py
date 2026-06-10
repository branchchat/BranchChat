"""Google Gemini provider (generateContent API).

Ported from the original ``gemini_service`` with its production behaviour kept
intact: the API key travels in a header (never the URL, so it can't land in
access logs), and the model-fallback chain from the handoff notes applies —
but ONLY when the caller didn't pin a model. A user who explicitly branched
with ``gemini-2.5-pro`` must not be silently downgraded to flash; the default
route (no ``model`` in the request) keeps the resilient try-default-then-
fallback chain the deployed frontend relies on.
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

logger = logging.getLogger("branchchat.providers.gemini")

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class _UpstreamRetryable(Exception):
    """Upstream failure worth retrying on the fallback model."""


def _to_contents(history, message: str) -> list[dict]:
    contents = [
        {
            "role": "model" if m.role == "assistant" else "user",
            "parts": [{"text": m.content}],
        }
        for m in history
    ]
    contents.append({"role": "user", "parts": [{"text": message}]})
    return contents


class GeminiProvider(AIProvider):
    name = "gemini"

    def is_configured(self) -> bool:
        return bool(settings.GEMINI_API_KEY)

    async def _call_model(
        self,
        client: httpx.AsyncClient,
        model: str,
        req: GenerationRequest,
        contents: list[dict],
    ) -> str:
        url = f"{settings.GEMINI_BASE_URL}/v1beta/models/{model}:generateContent"
        body = {
            "system_instruction": {"parts": [{"text": req.system_instruction}]},
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": req.max_output_tokens,
            },
        }
        try:
            resp = await client.post(
                url,
                json=body,
                headers={"x-goog-api-key": settings.GEMINI_API_KEY or ""},
            )
        except httpx.TimeoutException as exc:
            raise _UpstreamRetryable(f"timeout: {exc}") from exc
        except httpx.HTTPError as exc:
            raise _UpstreamRetryable(f"transport: {exc}") from exc

        if resp.status_code in _RETRYABLE_STATUS:
            raise _UpstreamRetryable(f"status {resp.status_code}")
        if resp.status_code >= 400:
            # Non-retryable (e.g. 400 bad request, 403 bad key). Log server-side,
            # but don't echo the upstream body to the client.
            logger.error(
                "Gemini non-retryable %s: %s", resp.status_code, resp.text[:500]
            )
            raise ProviderRejectedError()

        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            # Safety block or empty response.
            logger.warning("Gemini returned no candidates: %s", str(data)[:300])
            return ""
        parts = candidates[0].get("content", {}).get("parts") or []
        return "".join(p.get("text", "") for p in parts)

    async def generate(self, req: GenerationRequest) -> tuple[str, str]:
        contents = _to_contents(req.history, req.message)

        models = [req.model]
        if (
            req.model == settings.GEMINI_MODEL
            and settings.GEMINI_FALLBACK_MODEL
            and settings.GEMINI_FALLBACK_MODEL != settings.GEMINI_MODEL
        ):
            models.append(settings.GEMINI_FALLBACK_MODEL)

        async with httpx.AsyncClient(
            timeout=settings.GEMINI_TIMEOUT_SECONDS
        ) as client:
            last_exc: Exception | None = None
            for model in models:
                try:
                    text = await self._call_model(client, model, req, contents)
                    return text, model
                except _UpstreamRetryable as exc:
                    last_exc = exc
                    logger.warning(
                        "Gemini model %s failed (%s); trying next", model, exc
                    )
                    continue

        logger.error("All Gemini models failed: %s", last_exc)
        raise ProviderUpstreamError()
