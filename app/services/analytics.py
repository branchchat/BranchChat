"""PostHog analytics — server-side, fail-open, and a no-op until configured.

Wired in from day one (the brief: "implement PostHog compatibility off the bat").
Every call is wrapped so analytics can NEVER break a user request, and the whole
module degrades to a no-op when ``POSTHOG_API_KEY`` is unset (local dev/tests).

Event taxonomy backing the funnel + retention asks:

* ``user_signed_up``      — top of funnel (auth milestone)
* ``email_verified``      — account trust
* ``first_message_sent``  — the first meaningful key action (activation)
* ``message_sent``        — ongoing engagement; D1/D7 retention is computed in
  PostHog from these timestamps + the ``signup_date`` person property.
* ``branch_created`` / ``share_created`` — feature adoption

``distinct_id`` is the user id once signed in, else the anonymous id. On signup
we ``alias`` the anon id to the user id so pre-signup activity attributes to the
new account.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from app.core.config import settings

logger = logging.getLogger("branchchat.analytics")


@lru_cache
def _client() -> Any | None:
    if not settings.POSTHOG_API_KEY:
        return None
    try:
        from posthog import Posthog

        return Posthog(
            project_api_key=settings.POSTHOG_API_KEY,
            host=settings.POSTHOG_HOST,
        )
    except Exception:  # pragma: no cover - defensive import/init guard
        logger.exception("PostHog client init failed; analytics disabled")
        return None


def capture(
    distinct_id: str,
    event: str,
    properties: dict[str, Any] | None = None,
) -> None:
    client = _client()
    if client is None:
        return
    try:
        client.capture(
            distinct_id=distinct_id, event=event, properties=properties or {}
        )
    except Exception:  # pragma: no cover
        logger.exception("PostHog capture failed (event=%s)", event)


def identify(distinct_id: str, properties: dict[str, Any] | None = None) -> None:
    client = _client()
    if client is None:
        return
    try:
        client.identify(distinct_id=distinct_id, properties=properties or {})
    except Exception:  # pragma: no cover
        logger.exception("PostHog identify failed")


def alias(previous_id: str, distinct_id: str) -> None:
    client = _client()
    if client is None:
        return
    try:
        client.alias(previous_id=previous_id, distinct_id=distinct_id)
    except Exception:  # pragma: no cover
        logger.exception("PostHog alias failed")


def shutdown() -> None:
    """Flush queued events on app shutdown so nothing is lost on exit."""
    client = _client()
    if client is None:
        return
    try:
        client.shutdown()
    except Exception:  # pragma: no cover
        logger.exception("PostHog shutdown/flush failed")
