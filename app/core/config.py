"""Application settings.

All configuration comes from the environment (12-factor). Secrets (AI keys, JWT
secret, anon salt) live ONLY here on the server — never in the Vite/frontend env.

Two database URLs on purpose:

* ``DATABASE_URL``        — the app connection. Points at a NON-superuser,
  NOBYPASSRLS role (``app_user``) so row-level security actually enforces. In
  production this is the Supabase transaction pooler (set ``DB_USE_PGBOUNCER``).
* ``DATABASE_DIRECT_URL`` — an admin/direct (session-mode) connection used by
  Alembic for DDL, ``CREATE POLICY`` and extensions. Defaults to ``DATABASE_URL``.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # -- Environment --------------------------------------------------------
    ENV: Literal["development", "production", "test"] = "development"

    # -- Database -----------------------------------------------------------
    DATABASE_URL: str = (
        "postgresql+asyncpg://app_user:app_pw@localhost:5432/branchchat"
    )
    DATABASE_DIRECT_URL: str | None = None
    # Transaction-mode pooler (Supabase Supavisor / PgBouncer): asyncpg prepared
    # statements are unsafe across pooled server connections, so disable them.
    DB_USE_PGBOUNCER: bool = False
    DB_SSL: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 10  # → 10..20 total connections, per the brief
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    DB_ECHO: bool = False
    # Postgres custom GUC that carries the authenticated user id into RLS policies.
    DB_RLS_GUC: str = "app.user_id"

    # -- AI providers -------------------------------------------------------
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_FALLBACK_MODEL: str = "gemini-2.0-flash"
    GEMINI_TIMEOUT_SECONDS: float = 30.0
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com"

    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"
    OLLAMA_TIMEOUT_SECONDS: float = 120.0

    # -- Server-side guardrails (never trust the client) --------------------
    MAX_MESSAGE_CHARS: int = 5_000
    MAX_MESSAGE_CHARS_CODING: int = 10_000
    MAX_HISTORY_MESSAGES: int = 28
    MAX_HISTORY_CHARS: int = 48_000
    MAX_LINKED_CONTEXT_BLOCKS: int = 4
    MAX_PERSONALIZATION_CHARS: int = 2_000

    # -- Auth / cookies -----------------------------------------------------
    JWT_SECRET_KEY: str = "dev-insecure-change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    AUTH_COOKIE_NAME: str = "branchchat_token"
    ANON_COOKIE_NAME: str = "branchchat_anon_id"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    COOKIE_DOMAIN: str | None = None
    ANON_IDENTITY_SALT: str = "dev-insecure-anon-salt"

    # -- Login lockout ------------------------------------------------------
    LOGIN_MAX_FAILED: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    PASSWORD_MIN_LENGTH: int = 12

    # -- Email (Resend) + token TTLs ----------------------------------------
    RESEND_API_KEY: str | None = None
    RESEND_FROM_EMAIL: str | None = None
    # Frontend origin used to build verification / reset links.
    APP_BASE_URL: str = "http://localhost:5173"
    VERIFY_TOKEN_TTL_HOURS: int = 24
    RESET_TOKEN_TTL_MINUTES: int = 30

    # -- Usage quotas -------------------------------------------------------
    FREE_DAILY_MESSAGE_LIMIT: int = 10
    AUTHENTICATED_DAILY_MESSAGE_LIMIT: int = 50
    AUTHENTICATED_CODE_DAILY_MESSAGE_LIMIT: int = 10
    ANONYMOUS_NETWORK_BUCKET_MULTIPLIER: int = 5

    # -- Rate limits (requests per minute, per identity/IP bucket) ----------
    RATE_LIMIT_GLOBAL_PER_MIN: int = 120
    RATE_LIMIT_AI_PER_MIN: int = 20
    RATE_LIMIT_AUTH_PER_MIN: int = 10

    # -- CORS / hosts -------------------------------------------------------
    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    ALLOWED_HOSTS: Annotated[list[str], NoDecode] = ["*"]
    TRUST_PROXY_FORWARDED_IP: bool = False

    # -- Sharing ------------------------------------------------------------
    SHARE_LINK_TTL_DAYS: int = 30

    # -- Analytics (PostHog) ------------------------------------------------
    POSTHOG_API_KEY: str | None = None
    POSTHOG_HOST: str = "https://us.i.posthog.com"

    # -- Legacy server-persisted tree API (off by default) ------------------
    ENABLE_LEGACY_TREE_API: bool = False

    @field_validator("CORS_ORIGINS", "ALLOWED_HOSTS", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        # Accept comma-separated env strings ("a,b,c") as well as real lists.
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @property
    def alembic_url(self) -> str:
        """Sync-driver-agnostic URL Alembic should migrate against (admin/direct)."""
        return self.DATABASE_DIRECT_URL or self.DATABASE_URL


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
