"""Ollama provider: the optional local-model path (``VITE_PROVIDER=ollama``).

Same prompt assembly as Gemini (shared ``prompt`` module) so behaviour matches;
Ollama just takes a flat system+history+message message list.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.chat import ChatRequest
from app.services import prompt as prompt_svc
from app.services import reply_guardrails

logger = logging.getLogger("branchchat.ollama")


async def generate_reply(req: ChatRequest) -> str:
    message = req.message[
        : settings.MAX_MESSAGE_CHARS_CODING
        if req.coding_mode
        else settings.MAX_MESSAGE_CHARS
    ]
    history = prompt_svc.normalize_history(req.history, req.coding_mode)
    system_instruction = prompt_svc.build_system_instruction(
        coding_mode=req.coding_mode,
        personalization=req.personalization,
        linked_context=req.linked_context[: settings.MAX_LINKED_CONTEXT_BLOCKS],
    )

    messages = [{"role": "system", "content": system_instruction}]
    messages += [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": message})

    body = {"model": settings.OLLAMA_MODEL, "messages": messages, "stream": False}

    try:
        async with httpx.AsyncClient(
            timeout=settings.OLLAMA_TIMEOUT_SECONDS
        ) as client:
            resp = await client.post(f"{settings.OLLAMA_URL}/api/chat", json=body)
    except httpx.HTTPError as exc:
        logger.error("Ollama transport error: %s", exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach the local model. Is Ollama running?",
        ) from exc

    if resp.status_code >= 400:
        logger.error("Ollama error %s: %s", resp.status_code, resp.text[:300])
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail="The local model returned an error."
        )

    data = resp.json()
    text = (data.get("message") or {}).get("content", "")
    return reply_guardrails.sanitize_branching_reply(text)
