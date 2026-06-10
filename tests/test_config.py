"""Production must refuse to boot with the insecure dev-default secrets.

A shipped ``dev-insecure-*`` JWT secret / anon salt would let anyone forge auth
tokens and reverse anon-identity hashes, so production construction is a hard
error. Development / test keep the convenient defaults.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings

STRONG_SECRET = "x" * 40
STRONG_SALT = "y" * 40


def _make(**overrides) -> Settings:
    # Ignore any local .env so the result depends only on the explicit overrides.
    return Settings(_env_file=None, **overrides)


def test_production_rejects_default_secrets():
    with pytest.raises(ValidationError):
        _make(
            ENV="production",
            JWT_SECRET_KEY="dev-insecure-change-me",
            ANON_IDENTITY_SALT="dev-insecure-anon-salt",
        )


def test_production_rejects_short_secret():
    with pytest.raises(ValidationError):
        _make(ENV="production", JWT_SECRET_KEY="too-short", ANON_IDENTITY_SALT=STRONG_SALT)


def test_production_rejects_sub_32_char_jwt_secret():
    # HS256 floor is 32 (RFC 7518 §3.2): 16–31 chars passes the old floor but
    # must now be refused.
    with pytest.raises(ValidationError):
        _make(ENV="production", JWT_SECRET_KEY="x" * 31, ANON_IDENTITY_SALT=STRONG_SALT)


def test_production_rejects_empty_secret():
    with pytest.raises(ValidationError):
        _make(ENV="production", JWT_SECRET_KEY="", ANON_IDENTITY_SALT=STRONG_SALT)


def test_production_accepts_strong_secrets():
    s = _make(ENV="production", JWT_SECRET_KEY=STRONG_SECRET, ANON_IDENTITY_SALT=STRONG_SALT)
    assert s.is_production


def test_development_allows_dev_defaults():
    # The whole point of the dev defaults: local boot needs no secret wiring.
    s = _make(ENV="development")
    assert not s.is_production
