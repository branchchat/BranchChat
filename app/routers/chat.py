"""Stateless AI chat endpoint, generic over providers.

Contract (mirrors ``src/lib/api.ts``):
    POST /api/chat/{provider}      provider ∈ the provider registry
    →  { node_id, message, history, linked_context, coding_mode,
         personalization?, model? }
    ←  { node_id, reply, provider, model }

``/api/chat/gemini`` and ``/api/chat/ollama`` are unchanged registry members,
so the deployed frontend keeps working verbatim; ``model`` is optional and
falls back to the provider default. The browser stays the source of truth for
the tree: ``history`` carries the branch's inherited context on every call.

Ordering matters: the quota is charged inside a short RLS-bound transaction
that commits *before* the (slow) provider call, so we never hold a pooled DB
connection across an upstream HTTP request. Quota is provider-agnostic but
tiered by cost: high-cost models (catalog ``cost_tier="high"``) draw from a
smaller "premium" daily bucket; everything else shares the standard/coding
buckets.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import ai_rate_limit
from app.db.session import get_db, rls_tx
from app.routers.deps import IdentityContext, request_identity
from app.schemas.chat import ChatRequest, ChatResponse
from app.services import analytics, chat_service, model_catalog, usage_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


async def _charge_quota(
    session: AsyncSession, ctx: IdentityContext, kind: str
) -> None:
    async with rls_tx(session, ctx.user_id):
        await usage_service.enforce_message_quota(
            session,
            user_id=ctx.user_id,
            anon_id=ctx.anon_id,
            client_ip=ctx.client_ip,
            kind=kind,
        )


async def _refund_quota(
    session: AsyncSession, ctx: IdentityContext, kind: str
) -> None:
    async with rls_tx(session, ctx.user_id):
        await usage_service.refund_message_quota(
            session,
            user_id=ctx.user_id,
            anon_id=ctx.anon_id,
            client_ip=ctx.client_ip,
            kind=kind,
        )


@router.post("/{provider}", response_model=ChatResponse)
async def chat(
    provider: str,
    req: ChatRequest,
    ctx: IdentityContext = Depends(request_identity),
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(ai_rate_limit),
) -> ChatResponse:
    # Reject unknown providers/models BEFORE charging quota — a typo'd URL or
    # model id must not burn a daily message.
    _, model_id = chat_service.resolve_provider_and_model(provider, req.model)

    # High-cost models draw from the smaller premium bucket regardless of
    # coding mode — cost is the scarcer resource.
    if model_catalog.is_premium(provider, model_id):
        kind = "premium"
    elif req.coding_mode:
        kind = "coding"
    else:
        kind = "standard"

    await _charge_quota(session, ctx, kind)
    try:
        reply, model_used = await chat_service.generate_ai_response(
            provider_name=provider, req=req
        )
    except Exception:
        # Provider failed (e.g. a 5xx / not configured) — refund the charge so
        # the caller is only billed for a successful reply. A refund failure
        # must not mask the original provider error.
        try:
            await _refund_quota(session, ctx, kind)
        except Exception:
            pass
        raise
    analytics.capture(
        ctx.distinct_id,
        "message_sent",
        {
            "provider": provider,
            "model": model_used,
            "coding_mode": req.coding_mode,
        },
    )
    return ChatResponse(
        node_id=req.node_id, reply=reply, provider=provider, model=model_used
    )
