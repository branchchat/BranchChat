"""Task-based model recommendations.

Pure, rule-based v1 of the recommendation layer: classify the user's task
from cheap text signals, then score every *available* model's task affinities
from the catalog. Deliberately a pure function over ``model_catalog`` data so
it can later be swapped for an AI-powered router (or usage-learned weights)
without touching the API or the frontend.

Provider-agnostic by construction: it only sees ``ModelInfo`` records, and it
is fed already-filtered available models, so the system keeps recommending
sensibly when some providers have no key configured.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.model_catalog import ModelInfo, TaskCategory

# Rough chars-per-token used to compare inherited context against a model's
# window. Precision doesn't matter; this only nudges ranking for big trees.
_CHARS_PER_TOKEN = 4

# Signal patterns per task category. Word-boundary regexes over lowercased
# text; each hit adds weight. Kept intentionally simple and testable.
_TASK_PATTERNS: dict[TaskCategory, tuple[str, ...]] = {
    "coding": (
        r"\bcode\b", r"\bcoding\b", r"\bdebug\w*", r"\bbug\b", r"\berror\b",
        r"\bfunction\b", r"\brefactor\w*", r"\bcompil\w+", r"\bregex\b",
        r"\bpython\b", r"\btypescript\b", r"\bjavascript\b", r"\bsql\b",
        r"\bapi\b", r"\bimplement\w*", r"\bunit test\w*", r"\bstack trace\b",
        r"\bscript\b", r"```",
    ),
    "math": (
        r"\bmath\b", r"\bprove\b", r"\bproof\b", r"\bequation\b",
        r"\bcalculate\b", r"\bderivative\b", r"\bintegral\b",
        r"\bprobability\b", r"\btheorem\b", r"\balgebra\b", r"\bgeometry\b",
    ),
    "research": (
        r"\bresearch\b", r"\bsynthesi[sz]e\b", r"\bliterature\b",
        r"\bsources\b", r"\bcompare\b", r"\bstud(?:y|ies)\b",
        r"\bcitation\w*", r"\bfindings\b", r"\bsurvey\b", r"\banaly[sz]e\b",
    ),
    "writing": (
        r"\bwrite\b", r"\bessay\b", r"\bblog\b", r"\barticle\b", r"\bdraft\b",
        r"\bstory\b", r"\brewrite\b", r"\bcopy\b", r"\bemail\b",
        r"\blong-?form\b", r"\btone\b",
    ),
    "brainstorming": (
        r"\bbrainstorm\w*", r"\bideas\b", r"\bsuggest\w*", r"\bname\w* for\b",
        r"\balternatives\b", r"\boptions\b", r"\bwhat if\b",
    ),
    "multimodal": (
        r"\bimage\b", r"\bphoto\b", r"\bpicture\b", r"\bscreenshot\b",
        r"\bdiagram\b", r"\bvisual\b",
    ),
    "fast": (
        r"\bquick\w*\b", r"\bbrief\w*\b", r"\btl;?dr\b", r"\bshort answer\b",
        r"\bone[- ]liner\b", r"\bin a sentence\b",
    ),
    "reasoning": (
        r"\barchitect\w*", r"\bdesign\b", r"\bstrategy\b", r"\bplan\b",
        r"\btrade-?offs?\b", r"\bstep[- ]by[- ]step\b", r"\bcomplex\b",
        r"\bin depth\b", r"\bthorough\w*\b", r"\breason\w*\b",
    ),
}

# Human copy per dominant category, surfaced in the picker. Plain prose on
# purpose (it is end-user copy).
_REASON_BY_TASK: dict[TaskCategory, str] = {
    "coding": "Strong choice for coding, debugging, and technical tasks.",
    "math": "Strong choice for math and rigorous technical reasoning.",
    "research": "Recommended for research synthesis and structured analysis.",
    "writing": "Recommended for long-form writing and careful editing.",
    "brainstorming": "Good for generating and exploring many ideas quickly.",
    "multimodal": "Useful for image and multimodal analysis tasks.",
    "fast": "Fast, lightweight responses for quick questions.",
    "low_cost": "Low-cost option that keeps usage cheap.",
    "reasoning": "Recommended for complex, high-quality reasoning.",
    "general": "Dependable all-round choice for this conversation.",
}

Preference = str  # "quality" | "speed" | "cost" (anything else is ignored)


@dataclass(frozen=True)
class Recommendation:
    model: ModelInfo
    score: float
    reason: str
    task: TaskCategory


def classify_task(
    message: str, context_sample: str = "", coding_mode: bool = False
) -> dict[TaskCategory, float]:
    """Weight task categories from the latest message plus a context sample.

    The latest message is the strongest signal, so its hits count double
    relative to inherited-context hits. Returns normalised weights that always
    include a "general" floor so scoring never collapses to a single signal.
    """
    weights: dict[TaskCategory, float] = {}
    for source, factor in ((message, 2.0), (context_sample, 1.0)):
        text = (source or "").lower()
        if not text:
            continue
        for category, patterns in _TASK_PATTERNS.items():
            hits = sum(1 for p in patterns if re.search(p, text))
            if hits:
                # Diminishing returns: 1 hit signals the category; 5 hits
                # shouldn't drown everything else out.
                weights[category] = weights.get(category, 0.0) + factor * min(
                    hits, 3
                )
    if coding_mode:
        weights["coding"] = weights.get("coding", 0.0) + 2.0

    weights["general"] = max(weights.get("general", 0.0), 1.0)
    total = sum(weights.values())
    return {cat: w / total for cat, w in weights.items()}


def _context_fit(model: ModelInfo, context_chars: int) -> float:
    """Small score adjustment for how the inherited context fits the window."""
    if context_chars <= 0:
        return 0.0
    est_tokens = context_chars / _CHARS_PER_TOKEN
    if est_tokens > model.context_window * 0.5:
        return -0.15
    if est_tokens > 20_000 and model.context_window >= 400_000:
        return 0.05
    return 0.0


def _dominant_task(weights: dict[TaskCategory, float]) -> TaskCategory:
    # Highest weight wins; "general" only wins when nothing else signals.
    specific = {c: w for c, w in weights.items() if c != "general"}
    if specific:
        return max(specific, key=lambda c: specific[c])
    return "general"


def recommend_models(
    *,
    latest_user_message: str,
    available_models: list[ModelInfo],
    context_sample: str = "",
    context_chars: int = 0,
    coding_mode: bool = False,
    user_preference: Preference | None = None,
) -> list[Recommendation]:
    """Rank ``available_models`` for the task, best first.

    Score = sum(task_weight * model_task_affinity) + context fit + preference
    nudge, clamped to 0..1. Reasons explain the dominant task; the long-context
    bonus and preference get their own copy so the explanation matches what
    actually moved the ranking.
    """
    weights = classify_task(latest_user_message, context_sample, coding_mode)
    dominant = _dominant_task(weights)

    recs: list[Recommendation] = []
    for model in available_models:
        score = sum(
            weight * model.task_score(category)
            for category, weight in weights.items()
        )
        fit = _context_fit(model, context_chars)
        score += fit

        if user_preference == "speed":
            score += 0.15 * model.task_score("fast")
        elif user_preference == "cost":
            score += 0.15 * model.task_score("low_cost")
        elif user_preference == "quality":
            score += 0.15 * model.task_score("reasoning")

        reason = _REASON_BY_TASK[dominant]
        if fit > 0:
            reason += " Its large context window suits this long branch."
        elif fit < 0:
            reason += " Note: this branch may exceed its context window."
        if user_preference == "speed" and "Fast" in model.badges:
            reason += " Matches your speed preference."
        elif user_preference == "cost" and model.cost_tier == "low":
            reason += " Matches your cost preference."

        recs.append(
            Recommendation(
                model=model,
                score=max(0.0, min(1.0, round(score, 4))),
                reason=reason,
                task=dominant,
            )
        )

    # Stable sort: ties keep catalog order, which already lists defaults first.
    recs.sort(key=lambda r: r.score, reverse=True)
    return recs
