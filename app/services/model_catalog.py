"""Model registry: every model BranchChat can route to, with metadata.

This is the single source of truth the chat route validates against, the
``/api/models`` endpoint serves, and the recommender scores. It is plain data:
to add/retire a model, edit ``_CATALOG`` (and add a provider class if it's a
new vendor). Model ids are validated against this catalog before being
forwarded upstream, so clients can never inject arbitrary model strings.

Availability is computed per-call from the provider registry (key present?),
never stored — so the same build serves deployments with different keys, and
the app keeps working when some providers are unconfigured.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Literal, Mapping

from app.core.config import settings
from app.services import providers

# The task categories the recommender understands. Keep in sync with the
# scorer in ``model_recommender`` and the picker copy in the frontend.
TaskCategory = Literal[
    "coding",
    "research",
    "writing",
    "brainstorming",
    "math",
    "multimodal",
    "fast",
    "low_cost",
    "reasoning",
    "general",
]

TASK_CATEGORIES: tuple[TaskCategory, ...] = (
    "coding",
    "research",
    "writing",
    "brainstorming",
    "math",
    "multimodal",
    "fast",
    "low_cost",
    "reasoning",
    "general",
)


class UnknownModelError(ValueError):
    """Requested model id is not in the catalog for that provider."""


@dataclass(frozen=True)
class ModelInfo:
    provider: str
    id: str
    label: str
    description: str
    strengths: tuple[str, ...]
    weaknesses: tuple[str, ...]
    context_window: int  # tokens
    multimodal: bool
    speed: Literal["fast", "medium", "slow"]
    cost_tier: Literal["low", "medium", "high"]
    badges: tuple[str, ...]
    # 0..1 affinity per task category; missing categories default to 0.5.
    task_scores: Mapping[TaskCategory, float] = field(default_factory=dict)

    def task_score(self, category: TaskCategory) -> float:
        return float(self.task_scores.get(category, 0.5))

    @property
    def is_default(self) -> bool:
        return self.id == _DEFAULT_MODEL_BY_PROVIDER.get(self.provider)


def _static_catalog() -> tuple[ModelInfo, ...]:
    return (
        # ----- Google ------------------------------------------------------
        ModelInfo(
            provider="gemini",
            id="gemini-2.5-flash",
            label="Gemini 2.5 Flash",
            description="Fast, low-cost generalist — the everyday default.",
            strengths=("speed", "large-context recall", "multimodal analysis"),
            weaknesses=("can skim on hard multi-step reasoning",),
            context_window=1_000_000,
            multimodal=True,
            speed="fast",
            cost_tier="low",
            badges=("Best for everyday chat", "Huge context"),
            task_scores={
                "coding": 0.70,
                "research": 0.75,
                "writing": 0.70,
                "brainstorming": 0.75,
                "math": 0.65,
                "multimodal": 0.85,
                "fast": 0.95,
                "low_cost": 0.90,
                "reasoning": 0.60,
                "general": 0.80,
            },
        ),
        ModelInfo(
            provider="gemini",
            id="gemini-2.5-pro",
            label="Gemini 2.5 Pro",
            description="Digests huge documents, images, and full codebases.",
            strengths=(
                "very-long-context synthesis",
                "multimodal analysis",
                "technical reasoning",
            ),
            weaknesses=("slower and pricier than Flash",),
            context_window=1_000_000,
            multimodal=True,
            speed="slow",
            cost_tier="medium",
            badges=("Best for huge documents", "Best for images & PDFs"),
            task_scores={
                "coding": 0.85,
                "research": 0.90,
                "writing": 0.80,
                "brainstorming": 0.75,
                "math": 0.85,
                "multimodal": 0.90,
                "fast": 0.30,
                "low_cost": 0.40,
                "reasoning": 0.90,
                "general": 0.85,
            },
        ),
        # ----- OpenAI ------------------------------------------------------
        ModelInfo(
            provider="openai",
            id="gpt-5.2",
            label="GPT-5.2",
            description="OpenAI's flagship: sharp coder, strong at math and tools.",
            strengths=("coding and debugging", "math", "agentic/tool tasks"),
            weaknesses=("higher cost", "slower on long answers"),
            context_window=400_000,
            multimodal=True,
            speed="medium",
            cost_tier="high",
            badges=("Best for math", "Great at coding"),
            task_scores={
                "coding": 0.92,
                "research": 0.85,
                "writing": 0.85,
                "brainstorming": 0.85,
                "math": 0.92,
                "multimodal": 0.85,
                "fast": 0.45,
                "low_cost": 0.35,
                "reasoning": 0.93,
                "general": 0.90,
            },
        ),
        ModelInfo(
            provider="openai",
            id="gpt-5-mini",
            label="GPT-5 mini",
            description="Quick, inexpensive choice for simple questions.",
            strengths=("speed", "cost", "light coding"),
            weaknesses=("shallower on complex multi-step problems",),
            context_window=400_000,
            multimodal=True,
            speed="fast",
            cost_tier="low",
            badges=("Best for quick drafts", "Low cost"),
            task_scores={
                "coding": 0.75,
                "research": 0.70,
                "writing": 0.70,
                "brainstorming": 0.80,
                "math": 0.75,
                "multimodal": 0.75,
                "fast": 0.90,
                "low_cost": 0.88,
                "reasoning": 0.65,
                "general": 0.80,
            },
        ),
        # ----- Anthropic ---------------------------------------------------
        # Fable 5 is deliberately absent: at $10/$50 per MTok it's too
        # expensive to expose. Opus 4.8 is the premium Anthropic option.
        ModelInfo(
            provider="anthropic",
            id="claude-opus-4-8",
            label="Claude Opus 4.8",
            description=(
                "The most capable model here: best-in-class coding, deep "
                "research, and polished writing."
            ),
            strengths=(
                "best-in-class coding",
                "deep multi-step reasoning",
                "structured research synthesis",
                "long-form writing",
            ),
            weaknesses=("higher cost",),
            context_window=1_000_000,
            multimodal=True,
            speed="medium",
            cost_tier="high",
            badges=("Most capable overall", "Best for coding", "Best for writing & research"),
            task_scores={
                "coding": 0.93,
                "research": 0.92,
                "writing": 0.93,
                "brainstorming": 0.85,
                "math": 0.90,
                "multimodal": 0.80,
                "fast": 0.40,
                "low_cost": 0.30,
                "reasoning": 0.95,
                "general": 0.90,
            },
        ),
        ModelInfo(
            provider="anthropic",
            id="claude-sonnet-4-6",
            label="Claude Sonnet 4.6",
            description="Near-Opus quality at medium cost; dependable for most work.",
            strengths=("coding", "balanced quality/speed", "instruction following"),
            weaknesses=("not the strongest on frontier reasoning",),
            context_window=200_000,
            multimodal=True,
            speed="medium",
            cost_tier="medium",
            badges=("Best quality-for-price", "Strong coder"),
            task_scores={
                "coding": 0.90,
                "research": 0.88,
                "writing": 0.88,
                "brainstorming": 0.82,
                "math": 0.85,
                "multimodal": 0.80,
                "fast": 0.60,
                "low_cost": 0.55,
                "reasoning": 0.88,
                "general": 0.88,
            },
        ),
        ModelInfo(
            provider="anthropic",
            id="claude-haiku-4-5-20251001",
            label="Claude Haiku 4.5",
            description="Near-instant answers at the lowest Anthropic price.",
            strengths=("speed", "cost", "summaries and quick edits"),
            weaknesses=("less depth on hard problems",),
            context_window=200_000,
            multimodal=True,
            speed="fast",
            cost_tier="low",
            badges=("Fastest replies", "Low cost"),
            task_scores={
                "coding": 0.78,
                "research": 0.70,
                "writing": 0.72,
                "brainstorming": 0.75,
                "math": 0.70,
                "multimodal": 0.75,
                "fast": 0.93,
                "low_cost": 0.85,
                "reasoning": 0.60,
                "general": 0.78,
            },
        ),
        # ----- Local (Ollama) ----------------------------------------------
        ModelInfo(
            provider="ollama",
            id=settings.OLLAMA_MODEL,
            label=f"Local · {settings.OLLAMA_MODEL}",
            description="Runs on this machine. Free and private, but limited.",
            strengths=("free", "private", "offline"),
            weaknesses=("weakest quality", "no multimodal", "small context"),
            context_window=128_000,
            multimodal=False,
            speed="medium",
            cost_tier="low",
            badges=("Local", "Free"),
            task_scores={
                "coding": 0.50,
                "research": 0.45,
                "writing": 0.50,
                "brainstorming": 0.60,
                "math": 0.45,
                "multimodal": 0.10,
                "fast": 0.70,
                "low_cost": 1.00,
                "reasoning": 0.40,
                "general": 0.60,
            },
        ),
    )


_CATALOG: tuple[ModelInfo, ...] = _static_catalog()

# Per-provider default model: what a request without an explicit ``model``
# resolves to. Sourced from settings so deployments can repoint defaults
# without a code change (the deployed frontend never sends ``model``).
_DEFAULT_MODEL_BY_PROVIDER: dict[str, str] = {
    "gemini": settings.GEMINI_MODEL,
    "openai": settings.OPENAI_MODEL,
    "anthropic": settings.ANTHROPIC_MODEL,
    "ollama": settings.OLLAMA_MODEL,
}


def all_models() -> tuple[ModelInfo, ...]:
    return _CATALOG


def models_for_provider(provider: str) -> list[ModelInfo]:
    return [m for m in _CATALOG if m.provider == provider]


def available_models(extra_providers: Iterable[str] = ()) -> list[ModelInfo]:
    """Models whose provider is configured on this server, catalog order.

    ``extra_providers`` widens the set for one caller — the BYOK case, where
    the user's own key makes a provider usable even without a house key.
    """
    configured = set(providers.configured_provider_names()) | set(extra_providers)
    return [m for m in _CATALOG if m.provider in configured]


def get_model(provider: str, model_id: str) -> ModelInfo | None:
    for m in _CATALOG:
        if m.provider == provider and m.id == model_id:
            return m
    return None


def default_model_for(provider: str) -> str | None:
    return _DEFAULT_MODEL_BY_PROVIDER.get(provider)


def is_premium(provider: str, model_id: str) -> bool:
    """Whether a message to this model draws from the premium daily bucket.

    Keyed off the catalog's cost tier so new expensive models are covered by
    adding them with ``cost_tier="high"`` — no separate list to maintain.
    Unknown ids (e.g. a custom ``OLLAMA_MODEL`` default) are not premium.
    """
    model = get_model(provider, model_id)
    return model is not None and model.cost_tier == "high"


def resolve_model(provider: str, requested: str | None) -> str:
    """Map a request's optional ``model`` to the id sent upstream.

    No model → the provider's configured default (allowed even if the default
    isn't catalogued, e.g. a custom ``OLLAMA_MODEL``). An explicit model must
    exist in the catalog for that provider — this is the injection guard.
    """
    if requested is None or requested == "":
        default = default_model_for(provider)
        if default is None:
            raise UnknownModelError(provider)
        return default
    if get_model(provider, requested) is None:
        raise UnknownModelError(requested)
    return requested
