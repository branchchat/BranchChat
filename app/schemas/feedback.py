"""Request/response shapes for in-app feedback."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

FeedbackCategory = Literal["bug", "idea", "other"]


class FeedbackCreate(BaseModel):
    category: FeedbackCategory = "other"
    message: Annotated[str, Field(min_length=1, max_length=4_000)]
    # Light context the widget already knows; bounded and optional.
    path: Annotated[str | None, Field(max_length=200)] = None
    chat_title: Annotated[str | None, Field(max_length=200)] = None

    @field_validator("message")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("message must not be empty")
        return v


class FeedbackResponse(BaseModel):
    detail: str
