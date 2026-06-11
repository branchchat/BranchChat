"""FastAPI application factory and middleware wiring.

Middleware order (outermost → innermost as a request travels in):
    TrustedHost → CORS → global rate limit → origin check → security headers
    → body-size limit → app

CORS sits outside the rate-limit/origin layers so preflight is always answered
and CORS headers are present even on 4xx/5xx responses. ``allow_credentials`` is
on (cookie auth) which is why origins are an explicit allow-list, never ``*``.
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.rate_limit import RateLimitMiddleware
from app.core.security_headers import (
    OriginCheckMiddleware,
    SecurityHeadersMiddleware,
)
from app.routers import (
    admin,
    auth,
    chat,
    health,
    models,
    sync,
    unsubscribe,
    waitlist,
)
from app.services import analytics

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("branchchat")


class BodyTooLargeError(HTTPException):
    """Raised mid-stream by ``BodySizeLimitMiddleware``.

    An ``HTTPException`` subclass on purpose: FastAPI's body-reading code
    re-raises HTTPExceptions untouched (anything else is swallowed into a
    generic 400), so this surfaces as the intended 413 wherever the body is
    consumed.
    """

    def __init__(self) -> None:
        super().__init__(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Request body too large.",
        )


class BodySizeLimitMiddleware:
    """Reject oversized request bodies before they can exhaust memory.

    Two layers (pure ASGI, so what's measured is the real byte stream):
    a cheap Content-Length pre-check answers oversized declarations with an
    immediate 413, and a counter on the actually-received bytes stops a
    chunked request (which carries no Content-Length) from smuggling an
    unbounded body past the cap — crossing it raises ``BodyTooLargeError``
    (an HTTPException) from the body reader, which FastAPI renders as the
    same 413. Responses still traverse CORS (it wraps this middleware), so
    the 413 carries CORS headers and preflight is unaffected.
    """

    def __init__(self, app):
        self.app = app

    @staticmethod
    async def _reject(send, status_code: int, detail: str) -> None:
        body = json.dumps({"detail": detail}).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": status_code,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        max_bytes = settings.MAX_REQUEST_BODY_BYTES
        for name, value in scope.get("headers") or ():
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    await self._reject(
                        send, status.HTTP_400_BAD_REQUEST, "Invalid request."
                    )
                    return
                if declared > max_bytes:
                    await self._reject(
                        send,
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        "Request body too large.",
                    )
                    return

        received = 0
        response_started = False

        async def counting_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > max_bytes:
                    raise BodyTooLargeError()
            return message

        async def tracking_send(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except BodyTooLargeError:
            # Normally translated by the app-level 413 handler; this fallback
            # covers body reads that happen outside the exception middleware.
            if response_started:
                raise
            await self._reject(
                send,
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                "Request body too large.",
            )


def _warn_on_risky_production_config() -> None:
    """Loud startup warnings for prod settings that silently weaken security.

    These are warnings rather than boot failures because the right values
    depend on the platform (e.g. the exact Railway/Cloudflare hostnames), which
    the app can't verify from inside the container.
    """
    if not settings.is_production:
        return
    if settings.ALLOWED_HOSTS == ["*"]:
        logger.warning(
            "ALLOWED_HOSTS is '*': Host-header validation is OFF. Set it to the "
            "real API hostname(s) (e.g. api.branch-chat.com)."
        )
    if not settings.TRUST_PROXY_FORWARDED_IP:
        logger.warning(
            "TRUST_PROXY_FORWARDED_IP is false: behind a reverse proxy every "
            "client shares the proxy's IP, so per-IP rate limits and the "
            "anonymous network quota become one global bucket (one abuser can "
            "exhaust them for everyone). Set it to true when the platform's "
            "proxy sets X-Forwarded-For (Railway does)."
        )
    if not settings.RESEND_API_KEY or not settings.RESEND_FROM_EMAIL:
        logger.warning(
            "Email provider not configured: verification and password-reset "
            "emails will be dropped (token links are never logged in "
            "production)."
        )
    if settings.DB_SSL and not settings.DB_SSL_CA_FILE:
        logger.warning(
            "DB TLS is encrypted but UNVERIFIED (no DB_SSL_CA_FILE). Pin the "
            "Supabase CA certificate to enable full verification."
        )
    if not settings.SYNC_ENC_KEY:
        logger.warning(
            "SYNC_ENC_KEY is unset: synced chat payloads are stored as "
            "PLAINTEXT — anyone with database access can read user "
            "conversations. Set a 32-byte base64 key."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("BranchChat API starting (env=%s)", settings.ENV)
    _warn_on_risky_production_config()
    yield
    analytics.shutdown()


def create_app() -> FastAPI:
    # Hide interactive docs/schema in production.
    docs_kwargs = (
        {"docs_url": None, "redoc_url": None, "openapi_url": None}
        if settings.is_production
        else {}
    )
    app = FastAPI(title="BranchChat API", version="0.1.0", lifespan=lifespan, **docs_kwargs)

    # Innermost first; each add_middleware wraps the previous one.
    # BodySizeLimit MUST stay innermost: its mid-stream 413 is raised from the
    # request body reader, and any BaseHTTPMiddleware between it and the router
    # would swallow that into a generic 400 (the body is pumped through a
    # separate task there).
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(OriginCheckMiddleware, allowed_origins=settings.CORS_ORIGINS)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
        max_age=600,
    )
    if settings.ALLOWED_HOSTS and settings.ALLOWED_HOSTS != ["*"]:
        app.add_middleware(
            TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS
        )

    app.include_router(health.router)
    app.include_router(admin.router)
    app.include_router(auth.router)
    app.include_router(chat.router)
    app.include_router(models.router)
    app.include_router(sync.router)
    app.include_router(unsubscribe.router)
    app.include_router(waitlist.router)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Pydantic detail can echo input back; keep it generic + don't leak internals.
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": "Invalid request."},
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Something went wrong."},
        )

    return app


app = create_app()
