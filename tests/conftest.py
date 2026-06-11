from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def _no_global_rate_limit(monkeypatch):
    # The whole suite shares one client IP; the global per-IP middleware
    # (120/min) starts flaking once enough DB-backed tests stack up. The
    # middleware can't be dependency-overridden, so raise the ceiling.
    monkeypatch.setattr(settings, "RATE_LIMIT_GLOBAL_PER_MIN", 100_000)


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c
