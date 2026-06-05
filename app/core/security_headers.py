"""Security middleware: response headers and a CSRF-oriented origin check.

* ``SecurityHeadersMiddleware`` — adds defensive headers to every response. The
  CSP is locked to ``default-src 'none'`` because this is a JSON API (it serves
  no HTML/scripts of its own); the interactive docs routes are exempted so
  Swagger UI still loads in dev. Auth responses are marked ``no-store``.
* ``OriginCheckMiddleware`` — rejects state-changing requests whose ``Origin`` is
  not allow-listed. With cookie auth this is the primary CSRF defence; a forged
  cross-site POST always carries a browser-set ``Origin``. Requests with no
  ``Origin`` (non-browser clients) are allowed — they can't be CSRF.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
_DOCS_PREFIXES = ("/docs", "/redoc", "/openapi")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        path = request.url.path
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        h.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), browsing-topics=()",
        )
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        h.setdefault("X-XSS-Protection", "0")
        if not path.startswith(_DOCS_PREFIXES):
            h.setdefault(
                "Content-Security-Policy",
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            )
        if settings.is_production:
            h.setdefault(
                "Strict-Transport-Security",
                "max-age=63072000; includeSubDomains; preload",
            )
        if path.startswith("/api/auth"):
            h["Cache-Control"] = "no-store"
            h["Pragma"] = "no-cache"
        return response


class OriginCheckMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, allowed_origins: list[str]):
        super().__init__(app)
        self._allowed = set(allowed_origins)

    async def dispatch(self, request: Request, call_next):
        if request.method not in _SAFE_METHODS:
            origin = request.headers.get("origin")
            if origin and origin not in self._allowed:
                return JSONResponse(
                    {"detail": "Cross-origin request rejected."}, status_code=403
                )
        return await call_next(request)
