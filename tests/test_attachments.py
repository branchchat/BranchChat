"""Attachment plumbing: schema validation, pre-quota gating, provider shapes.

No network, no DB: providers are exercised through their payload-building
paths with a captured httpx call, and the gate is a pure function.
"""

from __future__ import annotations

import base64

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.chat import Attachment, ChatRequest
from app.services import chat_service
from app.services.providers.base import GenerationRequest
from app.services.providers.gemini import _to_contents

PNG_B64 = base64.b64encode(b"fake-png-bytes").decode()


def _att(media_type: str = "image/png") -> Attachment:
    return Attachment(name="x.png", media_type=media_type, data=PNG_B64)


# --- schema ------------------------------------------------------------------


def test_attachment_rejects_non_base64():
    with pytest.raises(ValidationError):
        Attachment(name="x.png", media_type="image/png", data="not base64!!")


def test_attachment_rejects_unknown_media_type():
    with pytest.raises(ValidationError):
        Attachment(name="x.svg", media_type="image/svg+xml", data=PNG_B64)


def test_chat_request_caps_attachment_count():
    with pytest.raises(ValidationError):
        ChatRequest(
            node_id="n",
            message="hi",
            attachments=[_att() for _ in range(4)],
        )


def test_attachment_only_message_is_allowed():
    # "Here's my resume" with no typed text: the file IS the message.
    req = ChatRequest(node_id="n", message="", attachments=[_att()])
    assert req.message == ""
    # Whitespace-only text counts as empty too.
    req = ChatRequest(node_id="n", message="   ", attachments=[_att()])
    assert req.message == ""


def test_empty_message_without_attachments_is_rejected():
    with pytest.raises(ValidationError):
        ChatRequest(node_id="n", message="")
    with pytest.raises(ValidationError):
        ChatRequest(node_id="n", message="   ")


# --- pre-quota gate ----------------------------------------------------------


def test_gate_passes_images_on_multimodal_models():
    chat_service.ensure_attachments_supported(
        "gemini", "gemini-2.5-pro", [_att()]
    )
    chat_service.ensure_attachments_supported(
        "anthropic", "claude-opus-4-8", [_att()]
    )
    chat_service.ensure_attachments_supported("openai", "gpt-5.2", [_att()])


def test_gate_rejects_pdf_on_openai():
    with pytest.raises(HTTPException) as exc:
        chat_service.ensure_attachments_supported(
            "openai", "gpt-5.2", [_att("application/pdf")]
        )
    assert exc.value.status_code == 422
    assert "PDF" in exc.value.detail


def test_gate_allows_pdf_on_gemini_and_anthropic():
    chat_service.ensure_attachments_supported(
        "gemini", "gemini-2.5-pro", [_att("application/pdf")]
    )
    chat_service.ensure_attachments_supported(
        "anthropic", "claude-sonnet-4-6", [_att("application/pdf")]
    )


def test_gate_no_op_without_attachments():
    chat_service.ensure_attachments_supported("openai", "gpt-5.2", [])


# --- provider payload shapes -------------------------------------------------


def test_gemini_contents_put_inline_data_before_text():
    contents = _to_contents([], "what is this?", [_att()])
    parts = contents[-1]["parts"]
    assert parts[0] == {
        "inline_data": {"mime_type": "image/png", "data": PNG_B64}
    }
    assert parts[-1] == {"text": "what is this?"}


def test_gemini_attachment_only_send_has_no_empty_text_part():
    contents = _to_contents([], "", [_att()])
    parts = contents[-1]["parts"]
    assert len(parts) == 1
    assert "inline_data" in parts[0]


@pytest.mark.asyncio
async def test_anthropic_builds_image_blocks_and_adaptive_thinking(monkeypatch):
    import app.services.providers.anthropic as mod

    captured: dict = {}

    class _FakeResp:
        status_code = 200

        @staticmethod
        def json():
            return {"content": [{"type": "text", "text": "ok"}], "usage": {}}

    class _FakeClient:
        def __init__(self, *a, **k): ...
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None, headers=None):
            captured["body"] = json
            return _FakeResp()

    monkeypatch.setattr(mod.httpx, "AsyncClient", _FakeClient)
    monkeypatch.setattr(mod.settings, "ANTHROPIC_API_KEY", "k")

    req = GenerationRequest(
        model="claude-opus-4-8",
        system_instruction="sys",
        history=[],
        message="describe",
        max_output_tokens=2048,
        attachments=[_att(), _att("application/pdf")],
    )
    text, _ = await mod.AnthropicProvider().generate(req)
    assert text == "ok"

    body = captured["body"]
    # Adaptive thinking on, with output-token headroom for the thinking.
    assert body["thinking"] == {"type": "adaptive"}
    assert body["max_tokens"] == 2048 + 6144
    blocks = body["messages"][-1]["content"]
    assert blocks[0]["type"] == "image"
    assert blocks[1]["type"] == "document"
    assert blocks[-1] == {"type": "text", "text": "describe"}


@pytest.mark.asyncio
async def test_openai_builds_data_url_content(monkeypatch):
    import app.services.providers.openai as mod

    captured: dict = {}

    class _FakeResp:
        status_code = 200

        @staticmethod
        def json():
            return {"choices": [{"message": {"content": "ok"}}]}

    class _FakeClient:
        def __init__(self, *a, **k): ...
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None, headers=None):
            captured["body"] = json
            return _FakeResp()

    monkeypatch.setattr(mod.httpx, "AsyncClient", _FakeClient)
    monkeypatch.setattr(mod.settings, "OPENAI_API_KEY", "k")

    req = GenerationRequest(
        model="gpt-5.2",
        system_instruction="sys",
        history=[],
        message="describe",
        max_output_tokens=2048,
        attachments=[_att()],
    )
    await mod.OpenAIProvider().generate(req)

    content = captured["body"]["messages"][-1]["content"]
    assert content[0]["type"] == "image_url"
    assert content[0]["image_url"]["url"].startswith("data:image/png;base64,")
    assert content[-1] == {"type": "text", "text": "describe"}

