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
from app.schemas.chat import ProviderMessage
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

        # Merge AFTER appending the new message: a (crafted) history ending in
        # a user turn would otherwise produce a same-role pair at the tail,
        # which this API hard-rejects.
        transcript = merge_alternating(
            [*req.history, ProviderMessage(role="user", content=req.message)]
        )
        messages: list[dict] = [
            {"role": m.role, "content": m.content} for m in transcript
        ]

        # Attachments ride on the final user turn as content blocks (images
        # and PDFs share the base64-source shape; only the block type
        # differs), with the text last so the question follows the media.
        if req.attachments and messages and messages[-1]["role"] == "user":
            blocks = [
                {
                    "type": "document"
                    if a.media_type == "application/pdf"
                    else "image",
                    "source": {
                        "type": "base64",
                        "media_type": a.media_type,
                        "data": a.data,
                    },
                }
                for a in req.attachments
            ]
            blocks.append({"type": "text", "text": messages[-1]["content"]})
            messages[-1] = {"role": "user", "content": blocks}

        body = {
            "model": req.model,
            "system": req.system_instruction,
            "messages": messages,
            "max_tokens": req.max_output_tokens,
            # Auto-places a cache breakpoint on the last prompt block. Each
            # turn then reads the entry the previous turn wrote, so only the
            # new tail is billed at full input price (reads are ~0.1x).
            # Prompts below the model's minimum (2-4K tokens) silently skip
            # caching, which is fine.
            "cache_control": {"type": "ephemeral"},
        }
        # Adaptive thinking (the model decides when/how deeply to reason) is
        # opt-in on this API — omitting it runs the model with thinking OFF,
        # which wastes exactly what the premium bucket pays for. Only the 4.6+
        # generation accepts {type: "adaptive"}; Haiku 4.5 still uses the old
        # budget scheme, so it stays as-is. Thinking tokens bill as output and
        # draw from max_tokens, so give the cap headroom — it's a ceiling, not
        # a target.
        if req.model.startswith(("claude-opus-4-8", "claude-sonnet-4-6")):
            body["thinking"] = {"type": "adaptive"}
            body["max_tokens"] = req.max_output_tokens + 6144

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
        usage = data.get("usage") or {}
        logger.info(
            "Anthropic usage: input=%s cache_write=%s cache_read=%s output=%s",
            usage.get("input_tokens"),
            usage.get("cache_creation_input_tokens"),
            usage.get("cache_read_input_tokens"),
            usage.get("output_tokens"),
        )
        blocks = data.get("content") or []
        text = "".join(
            b.get("text", "") for b in blocks if b.get("type") == "text"
        )
        return text, req.model
