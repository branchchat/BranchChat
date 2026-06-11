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


# --- branded layout ----------------------------------------------------------
# Email-client HTML is its own dialect: tables for layout, every style inline,
# no external CSS. Monochrome card on a soft gray canvas to match the site;
# one bold call-to-action button per email; muted footer with the legal links.

_BRAND_MARK = "https://branch-chat.com/brand-mark.png"


def _layout(
    *,
    heading: str,
    body_html: str,
    button_label: str,
    button_url: str,
    footnote: str,
) -> str:
    return f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:440px;">
        <tr><td style="padding:0 8px 16px;">
          <img src="{_BRAND_MARK}" width="28" height="28" alt=""
               style="border-radius:8px;vertical-align:middle;">
          <span style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                       font-size:16px;font-weight:700;color:#18181b;vertical-align:middle;
                       padding-left:8px;">BranchChat</span>
        </td></tr>
        <tr><td style="background-color:#ffffff;border-radius:16px;padding:36px 32px;
                       font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;
                     color:#18181b;text-align:center;">{heading}</h1>
          <div style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;
                      text-align:center;">{body_html}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="{button_url}"
                 style="display:inline-block;background-color:#18181b;color:#ffffff;
                        font-size:14px;font-weight:600;text-decoration:none;
                        padding:13px 28px;border-radius:12px;">{button_label}</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;
                    text-align:center;">If the button doesn't work, copy this link:<br>
            <a href="{button_url}" style="color:#71717a;word-break:break-all;">{button_url}</a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 8px 0;text-align:center;
                       font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#a1a1aa;">{footnote}</p>
          <p style="margin:0;font-size:12px;color:#a1a1aa;">
            <a href="https://branch-chat.com" style="color:#71717a;text-decoration:underline;">branch-chat.com</a>
            &nbsp;&middot;&nbsp;
            <a href="https://branch-chat.com/privacy" style="color:#71717a;text-decoration:underline;">Privacy</a>
            &nbsp;&middot;&nbsp;
            <a href="https://branch-chat.com/terms" style="color:#71717a;text-decoration:underline;">Terms</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def send_verification_email(to: str, raw_token: str) -> None:
    link = f"{settings.APP_BASE_URL}/verify-email?token={raw_token}"
    await _send(
        to,
        "Verify your BranchChat email",
        _layout(
            heading="Confirm it's you",
            body_html=(
                "Thanks for creating a BranchChat account. Confirm your email "
                "address to finish setting up."
            ),
            button_label="Verify your email",
            button_url=link,
            footnote=(
                "You're receiving this because an account was created with "
                "this address. If that wasn't you, you can ignore this email."
            ),
        ),
    )


async def send_password_reset_email(to: str, raw_token: str) -> None:
    link = f"{settings.APP_BASE_URL}/reset-password?token={raw_token}"
    await _send(
        to,
        "Reset your BranchChat password",
        _layout(
            heading="Reset your password",
            body_html=(
                "We received a request to reset your BranchChat password. "
                f"This link expires in {settings.RESET_TOKEN_TTL_MINUTES} minutes."
            ),
            button_label="Reset password",
            button_url=link,
            footnote=(
                "If you didn't request this, you can safely ignore this email "
                "— your password won't change."
            ),
        ),
    )


async def send_account_exists_email(to: str) -> None:
    """Sent when someone tries to sign up with an already-registered email.

    Lets us return the SAME generic response as a real signup (no account-
    existence leak) while still being helpful to the real owner.
    """
    await _send(
        to,
        "You already have a BranchChat account",
        _layout(
            heading="You already have an account",
            body_html=(
                "Someone tried to sign up with this email, but a BranchChat "
                "account already exists. If that was you, just sign in — and "
                "if you've forgotten your password, use “Forgot "
                "password” on the sign-in screen."
            ),
            button_label="Sign in",
            button_url=f"{settings.APP_BASE_URL}/app",
            footnote=(
                "If this wasn't you, no action is needed — your account is "
                "unchanged."
            ),
        ),
    )


async def send_beta_approved_email(to: str) -> None:
    """Sent when an admin grants beta access (see routers/admin.py)."""
    await _send(
        to,
        "You're in — BranchChat beta access approved",
        _layout(
            heading="You're in",
            body_html=(
                "Your BranchChat beta access has been approved. Sign in and "
                "start exploring AI conversations as branching trees — and if "
                "you hit anything rough, the Feedback button in the app goes "
                "straight to us."
            ),
            button_label="Open BranchChat",
            button_url=f"{settings.APP_BASE_URL}/app",
            footnote="You're receiving this because you requested beta access.",
        ),
    )
