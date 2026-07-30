"""Model registry + recommendation endpoints.

Public like the chat route (the picker must work for anonymous users), cheap
(no upstream calls; one indexed DB read for signed-in users to include their
BYOK providers), and covered by the global rate limiter. The frontend must
never hardcode model lists or recommendation copy — it renders what these
endpoints return, so model changes are backend-only deploys.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db, rls_tx
from app.routers.deps import IdentityContext, request_identity
from app.schemas.models import (
    ModelOut,
    ModelsResponse,
    ProviderOut,
    RecommendationOut,
    RecommendRequest,
    RecommendResponse,
)
from app.services import byok_service, model_catalog, model_recommender, providers

router = APIRouter(prefix="/api/models", tags=["models"])


def _to_model_out(info: model_catalog.ModelInfo) -> ModelOut:
    return ModelOut(
        provider=info.provider,
        id=info.id,
        label=info.label,
        description=info.description,
        strengths=list(info.strengths),
        weaknesses=list(info.weaknesses),
        context_window=info.context_window,
        multimodal=info.multimodal,
        speed=info.speed,
        cost_tier=info.cost_tier,
        badges=list(info.badges),
        is_default=info.is_default,
    )


@router.get("", response_model=ModelsResponse)
async def list_models(
    ctx: IdentityContext = Depends(request_identity),
    session: AsyncSession = Depends(get_db),
) -> ModelsResponse:
    house = set(providers.configured_provider_names())
    # BYOK: the caller's own keys make those providers usable for them even
    # without a house key, so the picker must include their models.
    byok: set[str] = set()
    if ctx.user_id is not None:
        async with rls_tx(session, ctx.user_id):
            byok = set(
                await byok_service.stored_providers(
                    session, user_id=ctx.user_id
                )
            )
    return ModelsResponse(
        models=[_to_model_out(m) for m in model_catalog.available_models(byok)],
        providers=[
            ProviderOut(
                name=name,
                configured=name in house or name in byok,
                byok=name in byok,
            )
            for name in providers.provider_names()
        ],
    )


@router.post("/recommend", response_model=RecommendResponse)
async def recommend(req: RecommendRequest) -> RecommendResponse:
    recommendations = model_recommender.recommend_models(
        latest_user_message=req.message,
        available_models=model_catalog.available_models(),
        context_sample=req.context_sample,
        context_chars=req.context_chars,
        coding_mode=req.coding_mode,
        user_preference=req.preference,
    )
    return RecommendResponse(
        recommendations=[
            RecommendationOut(
                provider=rec.model.provider,
                model=rec.model.id,
                label=rec.model.label,
                reason=rec.reason,
                score=round(rec.score, 2),
                badges=list(rec.model.badges),
                task=rec.task,
            )
            for rec in recommendations
        ]
    )
