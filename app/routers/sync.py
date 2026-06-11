"""Optional server-side sync of chat trees for signed-in users.

The app is local-first; these endpoints are a per-chat backup/sync target the
frontend opts into. Blobs are opaque (the frontend's versioned export
envelope) and conflict resolution is last-write-wins on the chat's own
``updatedAt`` ms timestamp:

* ``GET    /api/sync/chats``            → manifest (ids + versions, no payloads)
* ``GET    /api/sync/chats/{chat_id}``  → one chat's payload
* ``PUT    /api/sync/chats/{chat_id}``  → upsert; replies "stale" (200) when the
                                          server copy is newer instead of erroring,
                                          so the client just pulls
* ``DELETE /api/sync/chats/{chat_id}``  → remove the server copy

Every operation runs inside ``rls_tx`` with the caller's user id, so the
forced RLS policy on ``synced_chats`` is the real isolation boundary — the
queries never even see another user's rows.
"""

from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import auth_rate_limit
from app.db.session import get_db, rls_tx
from app.models import SyncedChat, User
from app.routers.deps import current_user
from app.schemas.sync import (
    SyncedChatOut,
    SyncManifest,
    SyncManifestEntry,
    SyncPutRequest,
    SyncPutResponse,
)

router = APIRouter(prefix="/api/sync", tags=["sync"])

# Client-generated chat ids — constrain to the store's id alphabet so junk
# can't become a key.
_CHAT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

# Guardrails for a free beta: a payload cap well under the global request-body
# limit, and a per-user chat cap so one account can't turn the table into a
# blob store. The frontend nudges an export well before chats get this big.
MAX_PAYLOAD_BYTES = 2_000_000
MAX_CHATS_PER_USER = 200


def _validate_chat_id(chat_id: str) -> None:
    if not _CHAT_ID_RE.fullmatch(chat_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid request.")


@router.get("/chats", response_model=SyncManifest)
async def list_chats(
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> SyncManifest:
    async with rls_tx(session, str(user.id)):
        rows = (
            await session.execute(
                select(
                    SyncedChat.chat_id,
                    SyncedChat.title,
                    SyncedChat.client_updated_at,
                ).order_by(SyncedChat.client_updated_at.desc())
            )
        ).all()
    return SyncManifest(
        chats=[
            SyncManifestEntry(chat_id=r.chat_id, title=r.title, updated_at=r.client_updated_at)
            for r in rows
        ]
    )


@router.get("/chats/{chat_id}", response_model=SyncedChatOut)
async def get_chat(
    chat_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> SyncedChatOut:
    _validate_chat_id(chat_id)
    async with rls_tx(session, str(user.id)):
        row = (
            await session.execute(
                select(SyncedChat).where(SyncedChat.chat_id == chat_id)
            )
        ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chat not found.")
    return SyncedChatOut(
        chat_id=row.chat_id,
        title=row.title,
        updated_at=row.client_updated_at,
        payload=row.payload,
    )


@router.put("/chats/{chat_id}", response_model=SyncPutResponse)
async def put_chat(
    chat_id: str,
    req: SyncPutRequest,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(auth_rate_limit),
) -> SyncPutResponse:
    _validate_chat_id(chat_id)
    # Measure the canonical serialization, not the request body (which may
    # carry whitespace); separators match what JSONB storage costs roughly.
    payload_bytes = len(json.dumps(req.payload, separators=(",", ":")).encode("utf-8"))
    if payload_bytes > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Chat too large to sync — export it locally instead.",
        )

    async with rls_tx(session, str(user.id)):
        existing_version = (
            await session.execute(
                select(SyncedChat.client_updated_at).where(
                    SyncedChat.chat_id == chat_id
                )
            )
        ).scalar_one_or_none()

        if existing_version is not None and existing_version > req.updated_at:
            return SyncPutResponse(status="stale", updated_at=existing_version)

        if existing_version is None:
            count = (
                await session.execute(
                    select(func.count()).select_from(SyncedChat)
                )
            ).scalar_one()
            if count >= MAX_CHATS_PER_USER:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    detail="Sync limit reached — delete old synced chats first.",
                )

        stmt = pg_insert(SyncedChat).values(
            user_id=user.id,
            chat_id=chat_id,
            title=req.title,
            payload=req.payload,
            client_updated_at=req.updated_at,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[SyncedChat.user_id, SyncedChat.chat_id],
            set_={
                "title": stmt.excluded.title,
                "payload": stmt.excluded.payload,
                "client_updated_at": stmt.excluded.client_updated_at,
                "synced_at": func.now(),
            },
            # Guard the race between our version read and the upsert: only let
            # an equal-or-newer write through (the policy already scopes rows
            # to this user).
            where=(SyncedChat.client_updated_at <= req.updated_at),
        )
        await session.execute(stmt)
    return SyncPutResponse(status="stored", updated_at=req.updated_at)


@router.delete("/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    chat_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    _validate_chat_id(chat_id)
    async with rls_tx(session, str(user.id)):
        await session.execute(
            delete(SyncedChat).where(SyncedChat.chat_id == chat_id)
        )
