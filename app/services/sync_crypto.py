"""At-rest sealing for synced chat payloads (privacy + size).

Without this, anyone with dashboard/SQL access to the database — founders,
a future hire, or an attacker with a dump — can read every synced
conversation in plaintext. ``seal`` compresses (chat-tree JSON shrinks
~5-10x) then encrypts with AES-256-GCM under ``SYNC_ENC_KEY``; the stored
JSONB becomes an opaque ``{"enc": 1, "n": ..., "d": ...}`` envelope, so the
same column serves both sealed and legacy plaintext rows with no migration.

This is server-side encryption, not end-to-end: the API must decrypt to
serve any signed-in device, so the key lives in the deploy env (Railway),
NOT the database. That separation is the point — DB access alone no longer
exposes conversations. Key unset → plaintext passthrough (local dev), with
a loud prod startup warning.

Key format: 32 bytes, urlsafe-base64. Generate one:
    python -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
Losing the key orphans sealed rows (clients still hold their local copies
and re-push on next sync) — store it like JWT_SECRET_KEY.
"""

from __future__ import annotations

import base64
import json
import os
import zlib

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


class SealedPayloadError(Exception):
    """A sealed row can't be opened (key missing/rotated or row corrupt)."""


def _key() -> bytes | None:
    raw = settings.SYNC_ENC_KEY
    if not raw:
        return None
    key = base64.urlsafe_b64decode(raw)
    if len(key) != 32:
        raise SealedPayloadError("SYNC_ENC_KEY must be 32 bytes (base64).")
    return key


def seal(payload: dict) -> dict:
    """Compress + encrypt for storage; plaintext passthrough without a key."""
    key = _key()
    if key is None:
        return payload
    nonce = os.urandom(12)
    plaintext = zlib.compress(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, None)
    return {
        "enc": 1,
        "n": base64.b64encode(nonce).decode("ascii"),
        "d": base64.b64encode(ciphertext).decode("ascii"),
    }


def unseal(stored: dict) -> dict:
    """Inverse of ``seal``; legacy plaintext rows pass through untouched."""
    if not (isinstance(stored, dict) and stored.get("enc") == 1):
        return stored
    key = _key()
    if key is None:
        raise SealedPayloadError("Encrypted row but SYNC_ENC_KEY is unset.")
    try:
        plaintext = AESGCM(key).decrypt(
            base64.b64decode(stored["n"]),
            base64.b64decode(stored["d"]),
            None,
        )
        return json.loads(zlib.decompress(plaintext))
    except (InvalidTag, KeyError, ValueError, zlib.error) as exc:
        raise SealedPayloadError(str(exc)) from exc
