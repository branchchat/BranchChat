"""Oversized request bodies are rejected with 413 before any parsing.

A generous cap (MAX_REQUEST_BODY_BYTES) stops a multi-hundred-MB payload from
exhausting memory during JSON parsing/validation. Shrink it for the test so we
don't have to actually send megabytes. (The pass-through case is covered by the
rest of the suite, which now traverses this middleware on every request.)
"""

from __future__ import annotations

from app.core.config import settings


def test_rejects_oversized_body(client, monkeypatch):
    monkeypatch.setattr(settings, "MAX_REQUEST_BODY_BYTES", 50)
    resp = client.post(
        "/api/waitlist",
        content=b"x" * 500,
        headers={"content-type": "application/json"},
    )
    # Rejected by the size gate before routing/DB, so this never touches the table.
    assert resp.status_code == 413
    assert resp.json()["detail"] == "Request body too large."
