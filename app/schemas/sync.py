"""Request/response shapes for /api/sync.

The payload is the frontend's versioned export envelope (``branchchat-session``
v1) passed through opaquely; the backend validates only the sync metadata it
needs (ids, version timestamps, size), never the tree itself.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class SyncManifestEntry(BaseModel):
    chat_id: str
    title: str | None = None
    updated_at: int  # the chat's updatedAt, epoch ms (the LWW version)
    # True = this chat was deliberately deleted (tombstone): other devices
    # should drop their local copy unless theirs is strictly newer, in which
    # case their push resurrects it.
    deleted: bool = False


class SyncManifest(BaseModel):
    chats: list[SyncManifestEntry]


class SyncedChatOut(BaseModel):
    chat_id: str
    title: str | None = None
    updated_at: int
    payload: dict


class SyncPutRequest(BaseModel):
    payload: dict
    updated_at: int = Field(ge=0)
    title: str | None = Field(default=None, max_length=200)


class SyncPutResponse(BaseModel):
    # "stored" = accepted; "stale" = server already has a newer version (the
    # client should pull instead of pushing again); "deleted" = this chat is
    # tombstoned and the push wasn't newer (the client should drop its copy).
    status: str
    updated_at: int
