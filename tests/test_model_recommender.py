"""Unit tests for the rule-based recommendation layer (pure, no app)."""

from __future__ import annotations

from app.services import model_catalog
from app.services.model_recommender import classify_task, recommend_models


def _models(*ids: str):
    by_id = {m.id: m for m in model_catalog.all_models()}
    return [by_id[i] for i in ids]


# -- task classification -------------------------------------------------------


def test_classify_coding_dominates_for_code_text():
    weights = classify_task("debug this python function, the error is weird")
    assert weights["coding"] > weights.get("writing", 0.0)
    assert weights["coding"] > weights["general"]


def test_classify_coding_mode_flag_counts_without_keywords():
    weights = classify_task("why does this happen", coding_mode=True)
    assert weights.get("coding", 0.0) > 0.0


def test_classify_context_sample_contributes_but_less_than_message():
    from_message = classify_task("write an essay about rivers")
    from_context = classify_task("ok", context_sample="write an essay about rivers")
    assert from_message["writing"] > from_context["writing"] > 0.0


def test_classify_plain_message_falls_back_to_general():
    weights = classify_task("hello there")
    assert max(weights, key=lambda c: weights[c]) == "general"


# -- ranking -------------------------------------------------------------------


def test_recommend_empty_model_list_is_empty_not_an_error():
    assert (
        recommend_models(latest_user_message="hi", available_models=[]) == []
    )


def test_recommend_prefers_high_affinity_for_dominant_task():
    models = _models("gemini-2.5-flash", "claude-opus-4-8")
    recs = recommend_models(
        latest_user_message="prove this theorem step by step",
        available_models=models,
    )
    assert recs[0].model.id == "claude-opus-4-8"  # math affinity .90 vs .65
    assert recs[0].score > recs[1].score


def test_recommend_huge_context_penalises_small_windows():
    models = _models("gemini-2.5-pro", "claude-haiku-4-5-20251001")
    # ~500k tokens of inherited context: over half of a 200k window (penalty),
    # exactly half of a 1M window (no penalty).
    recs = recommend_models(
        latest_user_message="synthesize the research findings so far",
        available_models=models,
        context_chars=2_000_000,
    )
    assert recs[0].model.id == "gemini-2.5-pro"
    penalised = next(r for r in recs if r.model.id == "claude-haiku-4-5-20251001")
    assert "context window" in penalised.reason


def test_recommend_speed_preference_boosts_fast_models():
    models = _models("gemini-2.5-flash", "gemini-2.5-pro")
    neutral = recommend_models(
        latest_user_message="analyze this research in depth",
        available_models=models,
    )
    speedy = recommend_models(
        latest_user_message="analyze this research in depth",
        available_models=models,
        user_preference="speed",
    )
    flash_rank_neutral = [r.model.id for r in neutral].index("gemini-2.5-flash")
    flash_rank_speedy = [r.model.id for r in speedy].index("gemini-2.5-flash")
    assert flash_rank_speedy <= flash_rank_neutral
    flash_speedy = next(
        r for r in speedy if r.model.id == "gemini-2.5-flash"
    )
    flash_neutral = next(
        r for r in neutral if r.model.id == "gemini-2.5-flash"
    )
    assert flash_speedy.score > flash_neutral.score


def test_reasons_are_human_copy():
    recs = recommend_models(
        latest_user_message="brainstorm names for a coffee shop",
        available_models=list(model_catalog.all_models()),
    )
    for rec in recs:
        assert rec.reason.strip()
        assert rec.reason[0].isupper()
