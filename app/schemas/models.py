"""Contract for the model registry + recommendation endpoints.

    GET  /api/models            →  ModelsResponse
    POST /api/models/recommend  →  RecommendResponse

Only metadata leaves the server — provider keys and base URLs never appear
here. ``models`` lists ONLY models whose provider is configured, so the picker
can't offer something the server can't serve.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field


class ModelOut(BaseModel):
    provider: str
    id: str
    label: str
    description: str
    strengths: list[str]
    weaknesses: list[str]
    context_window: int
    multimodal: bool
    speed: Literal["fast", "medium", "slow"]
    cost_tier: Literal["low", "medium", "high"]
    badges: list[str]
    is_default: bool


class ProviderOut(BaseModel):
    name: str
    configured: bool


class ModelsResponse(BaseModel):
    models: list[ModelOut]
    providers: list[ProviderOut]


class RecommendRequest(BaseModel):
    # The user's draft/latest message. May be empty when the picker is opened
    # before typing — recommendations then lean on the context sample.
    message: Annotated[str, Field(max_length=20_000)] = ""
    # A recent slice of the inherited branch context (NOT the full history —
    # classification only needs a sample) and the total context size in chars
    # (drives the context-window fit scoring).
    context_sample: Annotated[str, Field(max_length=8_000)] = ""
    context_chars: Annotated[int, Field(ge=0, le=10_000_000)] = 0
    coding_mode: bool = False
    preference: Literal["quality", "speed", "cost"] | None = None


class RecommendationOut(BaseModel):
    provider: str
    model: str
    label: str
    reason: str
    score: float
    badges: list[str]
    task: str


class RecommendResponse(BaseModel):
    recommendations: list[RecommendationOut]
