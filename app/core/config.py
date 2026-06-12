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

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Dev-only sentinel secrets. Shipping either of these to production is a hard
# startup error (see ``_forbid_insecure_secrets_in_production``): a known
# JWT_SECRET_KEY lets anyone forge auth tokens, and a known ANON_IDENTITY_SALT
# lets anyone reverse the anon-identity hashes.
_DEV_JWT_SECRET = "dev-insecure-change-me"
_DEV_ANON_SALT = "dev-insecure-anon-salt"
# Production floors. HS256 needs a key at least as long as its output (32
# bytes, RFC 7518 §3.2 — PyJWT ≥2.13 warns below this); the anon salt is a
# privacy HMAC where 16 random chars remain adequate.
_MIN_JWT_SECRET_LENGTH = 32
_MIN_SALT_LENGTH = 16


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
    # Path to a CA bundle (PEM) to fully verify the DB server's certificate
    # (verify-full). Unset → encrypted but UNVERIFIED TLS (sslmode=require),
    # accepted only because Supabase's pooler uses a private CA; download that
    # CA from the Supabase dashboard and set this to close the MITM gap.
    DB_SSL_CA_FILE: str | None = None
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

    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-5.2"
    OPENAI_TIMEOUT_SECONDS: float = 60.0
    OPENAI_BASE_URL: str = "https://api.openai.com"

    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"
    ANTHROPIC_TIMEOUT_SECONDS: float = 60.0
    ANTHROPIC_BASE_URL: str = "https://api.anthropic.com"

    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"
    OLLAMA_TIMEOUT_SECONDS: float = 120.0
    # Ollama needs no API key, so "configured" can't be inferred from secrets.
    # This flag controls whether it is ADVERTISED in /api/models (the legacy
    # /api/chat/ollama route keeps working either way) — leave false in prod,
    # where no local model runs.
    OLLAMA_ENABLED: bool = False

    # -- Server-side guardrails (never trust the client) --------------------
    MAX_MESSAGE_CHARS: int = 5_000
    MAX_MESSAGE_CHARS_CODING: int = 10_000
    # Reply length ceiling sent to the provider. A CEILING, not a target: a
    # short answer still costs little, so this only needs to be high enough
    # that long answers (detailed reviews, full code) aren't cut off
    # mid-sentence. The old 2048 truncated resume-review-length replies. 8192
    # is safe on every catalog model's output limit (Claude adds thinking
    # headroom on top — see providers/anthropic.py).
    MAX_OUTPUT_TOKENS: int = 8_192
    MAX_OUTPUT_TOKENS_CODING: int = 8_192
    MAX_HISTORY_MESSAGES: int = 28
    MAX_HISTORY_CHARS: int = 48_000
    MAX_LINKED_CONTEXT_BLOCKS: int = 4
    MAX_PERSONALIZATION_CHARS: int = 2_000
    # Hard ceiling on inbound request body size (bytes) — rejected with 413 before
    # JSON parsing so an oversized payload can't exhaust memory. Generous headroom
    # over any real chat payload (server truncates history to MAX_HISTORY_CHARS).
    MAX_REQUEST_BODY_BYTES: int = 5_000_000

    # -- Auth / cookies -----------------------------------------------------
    JWT_SECRET_KEY: str = _DEV_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    # 7 days. The old 60 minutes signed testers out mid-session constantly
    # (an open tab past the hour hit "session expired" on the next message).
    # The cookie is HttpOnly + Secure and a password change still invalidates
    # earlier tokens immediately (password_changed_at check in deps).
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7
    AUTH_COOKIE_NAME: str = "branchchat_token"
    ANON_COOKIE_NAME: str = "branchchat_anon_id"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    COOKIE_DOMAIN: str | None = None
    ANON_IDENTITY_SALT: str = _DEV_ANON_SALT

    # -- Login lockout ------------------------------------------------------
    LOGIN_MAX_FAILED: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    PASSWORD_MIN_LENGTH: int = 12
    # Durable per-IP brake counted from the login_attempts table, so it survives
    # restarts and applies across instances (the in-memory limiter does neither).
    # Generous vs. the per-account lockout: it only exists to stop one network
    # source spraying failures across MANY accounts. 0 disables.
    LOGIN_IP_MAX_FAILED: int = 30
    LOGIN_IP_WINDOW_MINUTES: int = 15
    # Audit-row retention: attempts older than this are swept on successful
    # logins (far beyond any throttle window; the table holds no PII — hashed
    # identifiers only). 0 disables the sweep.
    LOGIN_ATTEMPTS_RETENTION_DAYS: int = 30

    # -- Server-side sync ----------------------------------------------------
    # 32-byte urlsafe-base64 key; synced chat payloads are compressed +
    # AES-256-GCM sealed under it before hitting the database, so DB access
    # alone can't read conversations. Unset = plaintext (dev only).
    SYNC_ENC_KEY: str | None = None

    # -- Admin API -----------------------------------------------------------
    # Bearer for /api/admin/* (beta approvals). Unset = admin API disabled
    # (every admin route 404s). Use a long random value in production.
    ADMIN_API_TOKEN: str | None = None

    # Founders who get an email when a new account is created (CSV). Unset =
    # no signup alerts. The new user's verification email is unaffected.
    SIGNUP_ALERT_EMAILS: Annotated[list[str], NoDecode] = []

    # Founders who get an email when a tester submits feedback (CSV). Unset =
    # feedback is still stored in the DB, just not emailed.
    FEEDBACK_ALERT_EMAILS: Annotated[list[str], NoDecode] = []

    # -- Email (Resend) + token TTLs ----------------------------------------
    RESEND_API_KEY: str | None = None
    RESEND_FROM_EMAIL: str | None = None
    # Frontend origin used to build verification / reset links.
    APP_BASE_URL: str = "http://localhost:5173"
    # Public origin of THIS API — used to build the unsubscribe links baked
    # into marketing emails (they hit the backend, not the SPA). In prod set
    # to https://api.branch-chat.com.
    API_PUBLIC_URL: str = "http://localhost:8000"
    VERIFY_TOKEN_TTL_HOURS: int = 24
    RESET_TOKEN_TTL_MINUTES: int = 30

    # -- Usage quotas -------------------------------------------------------
    FREE_DAILY_MESSAGE_LIMIT: int = 10
    AUTHENTICATED_DAILY_MESSAGE_LIMIT: int = 50
    AUTHENTICATED_CODE_DAILY_MESSAGE_LIMIT: int = 10
    # Messages to models the catalog marks cost_tier="high" draw from their
    # own, smaller bucket. 0 disables premium models for that audience.
    AUTHENTICATED_PREMIUM_DAILY_MESSAGE_LIMIT: int = 10
    FREE_PREMIUM_DAILY_MESSAGE_LIMIT: int = 0
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

    @field_validator(
        "CORS_ORIGINS",
        "ALLOWED_HOSTS",
        "SIGNUP_ALERT_EMAILS",
        "FEEDBACK_ALERT_EMAILS",
        mode="before",
    )
    @classmethod
    def _split_csv(cls, v: object) -> object:
        # Accept comma-separated env strings ("a,b,c") as well as real lists.
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    @model_validator(mode="after")
    def _forbid_insecure_secrets_in_production(self) -> "Settings":
        """Refuse to boot production with the dev-default (or too-weak) secrets.

        Runs at settings construction (i.e. at import/startup), so a misconfigured
        deploy fails fast instead of silently serving forgeable JWTs and reversible
        anon-identity hashes.
        """
        if not self.is_production:
            return self
        problems: list[str] = []
        for name, dev_default, min_length in (
            ("JWT_SECRET_KEY", _DEV_JWT_SECRET, _MIN_JWT_SECRET_LENGTH),
            ("ANON_IDENTITY_SALT", _DEV_ANON_SALT, _MIN_SALT_LENGTH),
        ):
            value = getattr(self, name)
            if not value or value == dev_default:
                problems.append(f"{name} is unset or still the insecure dev default")
            elif len(value) < min_length:
                problems.append(
                    f"{name} must be at least {min_length} characters"
                )
        if problems:
            raise ValueError(
                "Refusing to start in production with insecure secrets: "
                + "; ".join(problems)
                + ". Set strong, unique values in the server environment."
            )
        return self

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
