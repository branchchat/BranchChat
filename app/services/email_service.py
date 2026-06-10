"""Transactional email (verification / password reset) via Resend.

Fail-soft and dev-friendly: when ``RESEND_API_KEY`` is unset (local dev/tests)
the link is logged instead of sent, so the flows are fully testable without an
email provider. A send failure never breaks the request — the user can re-request.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("branchchat.email")

_RESEND_ENDPOINT = "https://api.resend.com/emails"


async def _send(to: str, subject: str, html: str) -> None:
    if not settings.RESEND_API_KEY or not settings.RESEND_FROM_EMAIL:
        if settings.is_production:
            # The html carries a live verification/reset link — logging it in
            # production would put account-takeover tokens in the log stream.
            logger.error(
                "Email provider not configured in production; dropped %r email "
                "(recipient and token link withheld from logs).",
                subject,
            )
        else:
            logger.info("[email:dev] to=%s subject=%s\n%s", to, subject, html)
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={
                    "from": settings.RESEND_FROM_EMAIL,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
        if resp.status_code >= 400:
            logger.error("Resend error %s: %s", resp.status_code, resp.text[:300])
    except httpx.HTTPError:
        logger.exception("Resend transport error sending to %s", to)


async def send_verification_email(to: str, raw_token: str) -> None:
    link = f"{settings.APP_BASE_URL}/verify-email?token={raw_token}"
    await _send(
        to,
        "Verify your BranchChat email",
        f'<p>Confirm your email to finish setting up BranchChat.</p>'
        f'<p><a href="{link}">Verify email</a></p>',
    )


async def send_password_reset_email(to: str, raw_token: str) -> None:
    link = f"{settings.APP_BASE_URL}/reset-password?token={raw_token}"
    await _send(
        to,
        "Reset your BranchChat password",
        f'<p>We received a request to reset your password.</p>'
        f'<p><a href="{link}">Reset password</a> '
        f"(link expires in {settings.RESET_TOKEN_TTL_MINUTES} minutes).</p>"
        f"<p>If you didn't request this, you can ignore this email.</p>",
    )


async def send_account_exists_email(to: str) -> None:
    """Sent when someone tries to sign up with an already-registered email.

    Lets us return the SAME generic response as a real signup (no account-
    existence leak) while still being helpful to the real owner.
    """
    link = f"{settings.APP_BASE_URL}/forgot-password"
    await _send(
        to,
        "You already have a BranchChat account",
        f"<p>Someone tried to sign up with this email, but an account already "
        f'exists. If that was you, just <a href="{settings.APP_BASE_URL}/login">'
        f'log in</a> or <a href="{link}">reset your password</a>.</p>',
    )
