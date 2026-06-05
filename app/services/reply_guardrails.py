"""Output guardrails applied to every provider reply before it leaves the API.

Deliberately conservative: strip control characters and null bytes that could
break the client renderer or be used for log/header injection, normalise
whitespace, and bound the length. Kept as its own module so prompt-injection /
leakage mitigations can grow here without touching provider code.
"""

from __future__ import annotations

import re

# Allow tab/newline/carriage-return; drop other C0/C1 control chars + nulls.
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

MAX_REPLY_CHARS = 32_000


def sanitize_branching_reply(text: str) -> str:
    if not text:
        return ""
    cleaned = _CONTROL.sub("", text)
    cleaned = cleaned.replace("\r\n", "\n").strip()
    if len(cleaned) > MAX_REPLY_CHARS:
        cleaned = cleaned[:MAX_REPLY_CHARS].rstrip() + "…"
    return cleaned
