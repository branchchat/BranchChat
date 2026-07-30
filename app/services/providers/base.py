"""Provider abstraction: one interface, vendor API formatting kept inside.

Every AI vendor is an ``AIProvider`` subclass that turns a provider-neutral
``GenerationRequest`` into its own wire format and returns plain reply text.
Nothing outside ``app/services/providers`` may know vendor specifics; the rest
of the app goes through ``chat_service.generate_ai_response``.

Error model (mapped to HTTP in chat_service, never raised past it):
* ``ProviderNotConfiguredError`` — no API key/endpoint on this server → 503.
* ``ProviderRejectedError``      — upstream said no (4xx, bad request/key) → 502.
* ``ProviderUpstreamError``      — upstream down/timeout after retries → 502.

Providers must never put upstream response bodies into these exceptions —
log them server-side instead, so vendor errors can't leak to users.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field

from app.schemas.chat import Attachment, ProviderMessage


class ProviderNotConfiguredError(Exception):
    """The provider has no API key / endpoint configured on this server."""


class ProviderRejectedError(Exception):
    """The upstream API rejected the request (non-retryable 4xx)."""

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or "rejected")
        self.detail = detail


class ProviderUpstreamError(Exception):
    """The upstream API is unreachable/failing (timeout, 5xx, 429)."""

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or "upstream failure")
        self.detail = detail


@dataclass(frozen=True)
class GenerationRequest:
    """Provider-neutral completion request.

    ``history`` is the inherited branch context: user/assistant turns on the
    active path, oldest first, already normalised and truncated by the shared
    prompt module — providers only translate it, never re-derive it.
    """

    model: str
    system_instruction: str
    history: list[ProviderMessage]
    message: str
    max_output_tokens: int
    # Files riding with the NEW message only — history stays text (replaying
    # megabytes of base64 per turn would blow up every request after the
    # first; the UI tells users an attachment applies to the message it's
    # sent with). Already validated/capped by the schema and service layer.
    attachments: list[Attachment] = field(default_factory=list)
    # BYOK: the caller's own key for this provider. When set it replaces the
    # server's env key for this one request (and satisfies the configured
    # gate). Never logged, never echoed in errors — same rule as env keys.
    api_key_override: str | None = None


def merge_alternating(
    history: list[ProviderMessage],
) -> list[ProviderMessage]:
    """Coerce history into a strictly alternating user-first transcript.

    A tree path always alternates, but ``history`` is client-supplied, and some
    vendor APIs (Anthropic in particular) hard-reject consecutive same-role
    turns or an assistant-first transcript. Merge adjacent same-role turns and
    drop a leading assistant turn (it can become leading after truncation cuts
    the user turn above it).
    """
    merged: list[ProviderMessage] = []
    for msg in history:
        if merged and merged[-1].role == msg.role:
            merged[-1] = ProviderMessage(
                role=msg.role, content=f"{merged[-1].content}\n\n{msg.content}"
            )
        else:
            merged.append(msg)
    if merged and merged[0].role == "assistant":
        merged = merged[1:]
    return merged


class AIProvider(abc.ABC):
    """One AI vendor behind the unified generation interface."""

    #: registry key — also the public URL segment (``POST /api/chat/{name}``).
    name: str

    @abc.abstractmethod
    def is_configured(self) -> bool:
        """Whether this server can actually call the vendor (key/endpoint set)."""

    @abc.abstractmethod
    async def generate(self, req: GenerationRequest) -> tuple[str, str]:
        """Call the vendor; return ``(raw_reply_text, model_id_used)``.

        ``model_id_used`` can differ from ``req.model`` when a provider falls
        back internally (Gemini's default chain) — the UI shows users which
        model really answered, so report it truthfully. Guardrails run later.
        """
