"""Request/response contract for the stateless chat endpoints.

This mirrors EXACTLY what the frontend (``src/lib/api.ts``) sends and expects, so
the two stay in lockstep:

    POST /api/chat/{provider}            (provider ∈ the provider registry)
    →  { node_id, message, history, linked_context, coding_mode,
         personalization?, model? }
    ←  { node_id, reply, provider, model }

``node_id`` is an opaque correlation id echoed back — the server never loads a
tree from it. ``model`` is the model-specific-branches addition: optional and
validated against the model catalog (absent → the provider's default, which is
exactly the pre-existing behaviour, so old clients are unaffected). The
response's ``provider``/``model`` report what actually generated the reply.
Field caps here are a hard abuse ceiling; the service truncates to the
per-mode limits from settings (the client already truncates to the same).
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

Role = Literal["system", "user", "assistant"]


class ProviderMessage(BaseModel):
    role: Role
    content: Annotated[str, Field(max_length=60_000)] = ""


class LinkedContextBlock(BaseModel):
    source_node_id: Annotated[str, Field(max_length=200)]
    source_label: Annotated[str | None, Field(max_length=200)] = None
    messages: Annotated[list[ProviderMessage], Field(max_length=200)] = Field(
        default_factory=list
    )


class ChatRequest(BaseModel):
    node_id: Annotated[str, Field(max_length=200)]
    message: Annotated[str, Field(min_length=1, max_length=20_000)]
    history: Annotated[list[ProviderMessage], Field(max_length=200)] = Field(
        default_factory=list
    )
    linked_context: Annotated[
        list[LinkedContextBlock], Field(max_length=16)
    ] = Field(default_factory=list)
    coding_mode: bool = False
    personalization: Annotated[str | None, Field(max_length=4_000)] = None
    # Optional model override for the branch; validated against the model
    # catalog in the service layer (a schema validator can't see the path's
    # provider). None → the provider's configured default.
    model: Annotated[str | None, Field(max_length=100)] = None

    @field_validator("message")
    @classmethod
    def _strip_message(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("message must not be empty")
        return v


class ChatResponse(BaseModel):
    node_id: str
    reply: str
    # What actually generated the reply (additive; old clients ignore these).
    # ``model`` can differ from the request when the provider fell back.
    provider: str | None = None
    model: str | None = None
