"""Schemas for the BYOK key-management endpoints (mirrors src/lib/api.ts)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ByokProvider = Literal["gemini", "openai", "anthropic"]


class ApiKeyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: ByokProvider
    api_key: str = Field(min_length=8, max_length=256)

    @field_validator("api_key")
    @classmethod
    def _no_whitespace(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or any(ch.isspace() for ch in cleaned):
            raise ValueError("api_key must not contain whitespace")
        return cleaned


class ApiKeyOut(BaseModel):
    """Stored-key metadata. The key itself is never in any response."""

    provider: str
    key_hint: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApiKeysResponse(BaseModel):
    keys: list[ApiKeyOut]


class MessageOut(BaseModel):
    detail: str
