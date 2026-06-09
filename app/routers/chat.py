"""Stateless AI chat endpoints.

Contract (mirrors ``src/lib/api.ts``):
    POST /api/chat/gemini   and   POST /api/chat/ollama
    →  { node_id, message, history, linked_context, coding_mode, personalization? }
    ←  { node_id, reply }

Ordering matters: the quota is charged inside a short RLS-bound transaction that
commits *before* the (slow) provider call, so we never hold a pooled DB
connection across an upstream HTTP request.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import ai_rate_limit
from app.db.session import get_db, rls_tx
from app.routers.deps import IdentityContext, request_identity
from app.schemas.chat import ChatRequest, ChatResponse
from app.services import analytics
from app.services import gemini_service, ollama_service, usage_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


async def _charge_quota(
    session: AsyncSession, ctx: IdentityContext, coding_mode: bool
) -> None:
    async with rls_tx(session, ctx.user_id):
        await usage_service.enforce_message_quota(
            session,
            user_id=ctx.user_id,
            anon_id=ctx.anon_id,
            client_ip=ctx.client_ip,
            coding_mode=coding_mode,
        )


async def _refund_quota(
    session: AsyncSession, ctx: IdentityContext, coding_mode: bool
) -> None:
    async with rls_tx(session, ctx.user_id):
        await usage_service.refund_message_quota(
            session,
            user_id=ctx.user_id,
            anon_id=ctx.anon_id,
            client_ip=ctx.client_ip,
            coding_mode=coding_mode,
        )


@router.post("/gemini", response_model=ChatResponse)
async def chat_gemini(
    req: ChatRequest,
    ctx: IdentityContext = Depends(request_identity),
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(ai_rate_limit),
) -> ChatResponse:
    await _charge_quota(session, ctx, req.coding_mode)
    try:
        reply = await gemini_service.generate_reply(req)
    except Exception:
        # Provider failed (e.g. a 5xx / not configured) — refund the charge so
        # the caller is only billed for a successful reply. A refund failure
        # must not mask the original provider error.
        try:
            await _refund_quota(session, ctx, req.coding_mode)
        except Exception:
            pass
        raise
    analytics.capture(
        ctx.distinct_id,
        "message_sent",
        {"provider": "gemini", "coding_mode": req.coding_mode},
    )
    return ChatResponse(node_id=req.node_id, reply=reply)


@router.post("/ollama", response_model=ChatResponse)
async def chat_ollama(
    req: ChatRequest,
    ctx: IdentityContext = Depends(request_identity),
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(ai_rate_limit),
) -> ChatResponse:
    await _charge_quota(session, ctx, req.coding_mode)
    try:
        reply = await ollama_service.generate_reply(req)
    except Exception:
        # Provider failed (e.g. a 5xx / not configured) — refund the charge so
        # the caller is only billed for a successful reply. A refund failure
        # must not mask the original provider error.
        try:
            await _refund_quota(session, ctx, req.coding_mode)
        except Exception:
            pass
        raise
    analytics.capture(
        ctx.distinct_id,
        "message_sent",
        {"provider": "ollama", "coding_mode": req.coding_mode},
    )
    return ChatResponse(node_id=req.node_id, reply=reply)
