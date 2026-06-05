"""FastAPI application factory and middleware wiring.

Middleware order (outermost → innermost as a request travels in):
    TrustedHost → CORS → global rate limit → origin check → security headers → app

CORS sits outside the rate-limit/origin layers so preflight is always answered
and CORS headers are present even on 4xx/5xx responses. ``allow_credentials`` is
on (cookie auth) which is why origins are an explicit allow-list, never ``*``.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
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
from app.routers import chat, health
from app.services import analytics

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("branchchat")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("BranchChat API starting (env=%s)", settings.ENV)
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
    app.include_router(chat.router)

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
