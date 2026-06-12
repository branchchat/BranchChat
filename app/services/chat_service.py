"""Unified AI generation: the one function the chat route calls.

``generate_ai_response(provider, model, req)`` is the only path from the API
to a vendor. It owns everything the providers must NOT duplicate:

* prompt assembly (shared system policy, linked-context rules, history
  normalisation + per-mode truncation caps) via ``prompt``;
* model resolution/validation against ``model_catalog`` (no client-supplied
  model string ever reaches a vendor unvalidated);
* mapping provider failures to the API's stable, user-safe error contract
  (503 not configured, 502 upstream) without leaking vendor responses.

Providers only translate a ``GenerationRequest`` into their wire format.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.chat import ChatRequest
from app.services import model_catalog
from app.services import prompt as prompt_svc
from app.services import providers, reply_guardrails
from app.services.providers import (
    GenerationRequest,
    ProviderNotConfiguredError,
    ProviderRejectedError,
    ProviderUpstreamError,
)


def resolve_provider_and_model(
    provider_name: str, requested_model: str | None
) -> tuple[providers.AIProvider, str]:
    """Validate the URL's provider and the body's optional model, or 404/422.

    The detail strings are user-facing copy by contract (the frontend renders
    them directly), so keep them human and generic.
    """
    provider = providers.get_provider(provider_name)
    if provider is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Unknown AI provider."
        )
    try:
        model_id = model_catalog.resolve_model(provider_name, requested_model)
    except model_catalog.UnknownModelError:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown model for this provider.",
        ) from None
    return provider, model_id


def ensure_attachments_supported(
    provider_name: str, model_id: str, attachments: list
) -> None:
    """422 when attachments can't reach this model — called BEFORE quota.

    Images need a multimodal model; PDFs additionally need a vendor that
    accepts them inline (Gemini and Anthropic do; OpenAI chat completions and
    local Ollama don't). Detail strings are user-facing copy by contract.
    """
    if not attachments:
        return
    info = model_catalog.get_model(provider_name, model_id)
    if info is None or not info.multimodal:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This model doesn't support attachments.",
        )
    if any(
        a.media_type == "application/pdf" for a in attachments
    ) and provider_name not in ("gemini", "anthropic"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "PDF attachments work with Gemini and Claude models — "
                "pick one of those, or attach images instead."
            ),
        )


async def generate_ai_response(
    *, provider_name: str, req: ChatRequest
) -> tuple[str, str]:
    """Generate a reply for ``req`` via ``provider_name``.

    Returns ``(reply, model_id_used)``. Raises HTTPException with the API's
    stable error contract on any failure.
    """
    provider, model_id = resolve_provider_and_model(provider_name, req.model)

    # Ollama is exempt from the is_configured gate here: it needs no key and
    # the legacy /api/chat/ollama route must keep working for local dev even
    # when it isn't advertised in /api/models (OLLAMA_ENABLED=false).
    if provider.name != "ollama" and not provider.is_configured():
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

    generation = GenerationRequest(
        model=model_id,
        system_instruction=system_instruction,
        history=history,
        message=message,
        max_output_tokens=(
            settings.MAX_OUTPUT_TOKENS_CODING
            if req.coding_mode
            else settings.MAX_OUTPUT_TOKENS
        ),
        attachments=req.attachments,
    )

    try:
        text, model_used = await provider.generate(generation)
    except ProviderNotConfiguredError:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI provider is not configured.",
        ) from None
    except ProviderRejectedError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=exc.detail or "The AI provider rejected the request.",
        ) from None
    except ProviderUpstreamError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=exc.detail
            or "The AI provider is temporarily unavailable. Please try again.",
        ) from None

    return reply_guardrails.sanitize_branching_reply(text), model_used
