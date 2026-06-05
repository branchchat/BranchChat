"""Gemini provider: prompt assembly, HTTP call, and model fallback.

Fallback hardening (per the handoff notes): try ``GEMINI_MODEL`` first; on a
retryable upstream condition — timeout, 429, or 5xx (incl. the 504s seen in
prod) — retry once on ``GEMINI_FALLBACK_MODEL``. Non-retryable upstream errors
(bad request, auth) surface immediately. The API key is sent as a header, never
in the URL/query, so it doesn't land in access logs.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.chat import ChatRequest
from app.services import prompt as prompt_svc
from app.services import reply_guardrails

logger = logging.getLogger("branchchat.gemini")

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


async def _call_model(
    client: httpx.AsyncClient,
    model: str,
    system_instruction: str,
    contents: list[dict],
    max_output_tokens: int,
) -> str:
    url = f"{settings.GEMINI_BASE_URL}/v1beta/models/{model}:generateContent"
    body = {
        "system_instruction": {"parts": [{"text": system_instruction}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": max_output_tokens,
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
        # Non-retryable (e.g. 400 bad request, 403 bad key). Log server-side, but
        # don't echo the upstream body to the client.
        logger.error("Gemini non-retryable %s: %s", resp.status_code, resp.text[:500])
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail="The AI provider rejected the request."
        )

    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        # Safety block or empty response.
        logger.warning("Gemini returned no candidates: %s", str(data)[:300])
        return ""
    parts = candidates[0].get("content", {}).get("parts") or []
    return "".join(p.get("text", "") for p in parts)


async def generate_reply(req: ChatRequest) -> str:
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI provider is not configured.",
        )

    message = req.message[
        : settings.MAX_MESSAGE_CHARS_CODING
        if req.coding_mode
        else settings.MAX_MESSAGE_CHARS
    ]
    history = prompt_svc.normalize_history(req.history, req.coding_mode)
    system_instruction = prompt_svc.build_system_instruction(
        coding_mode=req.coding_mode,
        personalization=req.personalization,
        linked_context=req.linked_context[: settings.MAX_LINKED_CONTEXT_BLOCKS],
    )
    contents = _to_contents(history, message)
    max_tokens = 4096 if req.coding_mode else 2048

    models = [settings.GEMINI_MODEL]
    if settings.GEMINI_FALLBACK_MODEL and settings.GEMINI_FALLBACK_MODEL != settings.GEMINI_MODEL:
        models.append(settings.GEMINI_FALLBACK_MODEL)

    async with httpx.AsyncClient(timeout=settings.GEMINI_TIMEOUT_SECONDS) as client:
        last_exc: Exception | None = None
        for model in models:
            try:
                text = await _call_model(
                    client, model, system_instruction, contents, max_tokens
                )
                return reply_guardrails.sanitize_branching_reply(text)
            except _UpstreamRetryable as exc:
                last_exc = exc
                logger.warning("Gemini model %s failed (%s); trying next", model, exc)
                continue

    logger.error("All Gemini models failed: %s", last_exc)
    raise HTTPException(
        status.HTTP_502_BAD_GATEWAY,
        detail="The AI provider is temporarily unavailable. Please try again.",
    )
