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


async def _send(
    to: str,
    subject: str,
    html: str,
    *,
    headers: dict[str, str] | None = None,
) -> None:
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
    payload: dict[str, object] = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    # e.g. List-Unsubscribe / List-Unsubscribe-Post for marketing sends.
    if headers:
        payload["headers"] = headers
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json=payload,
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


def _notice_layout(*, heading: str, body_html: str) -> str:
    """Minimal internal-notice card (brand header + body, no button/footer).

    For founder-facing operational emails (e.g. a new-signup heads-up), not
    user-facing transactional mail.
    """
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
        <tr><td style="background-color:#ffffff;border-radius:16px;padding:32px;
                       font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <h1 style="margin:0 0 12px;font-size:18px;line-height:1.3;font-weight:700;
                     color:#18181b;">{heading}</h1>
          <div style="font-size:14px;line-height:1.6;color:#52525b;">{body_html}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def send_new_signup_alert(new_email: str, recipients: list[str]) -> None:
    """Heads-up to the founders that a new account was created and needs review.

    No-op when no recipients are configured (SIGNUP_ALERT_EMAILS unset). Sent
    from a BackgroundTask so it never adds latency to (or a timing signal on)
    the signup response.
    """
    if not recipients:
        return
    code = (
        '<code style="background:#f1f1f4;padding:2px 6px;border-radius:6px;'
        'font-size:13px;color:#18181b;">'
    )
    html = _notice_layout(
        heading="New BranchChat signup",
        body_html=(
            f'<p style="margin:0 0 12px;"><strong style="color:#18181b;">{new_email}</strong> '
            "just created an account and is awaiting beta approval.</p>"
            f'<p style="margin:0;">Approve them with {code}beta-admin.ps1 approve '
            f"{new_email}</code> (or revoke / ignore if it looks like spam).</p>"
        ),
    )
    for to in recipients:
        await _send(to, f"New signup: {new_email}", html)


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


# --- marketing layout (announcements) ----------------------------------------
# Unlike the transactional _layout (one centered paragraph + one button), an
# announcement carries multiple left-aligned sections, so the body is passed
# as ready HTML. It also REQUIRES an unsubscribe link (it's marketing, not
# transactional) which the footer renders and the caller mirrors into the
# List-Unsubscribe header.

_SECTION_LABEL = (
    "margin:24px 0 10px;font-size:13px;font-weight:700;color:#18181b;"
    "text-transform:uppercase;letter-spacing:0.03em;"
)
_BODY = "font-size:14px;line-height:1.65;color:#52525b;"


def _email_button(label: str, url: str) -> str:
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="margin:24px 0;"><tr><td align="center">'
        f'<a href="{url}" style="display:inline-block;background-color:#18181b;'
        "color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;"
        f'padding:13px 28px;border-radius:12px;">{label}</a>'
        "</td></tr></table>"
    )


def _marketing_layout(
    *,
    heading: str,
    body_html: str,
    unsubscribe_url: str,
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
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:700;
                     color:#18181b;text-align:center;">{heading}</h1>
          {body_html}
        </td></tr>
        <tr><td style="padding:20px 8px 0;text-align:center;
                       font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#a1a1aa;">{footnote}</p>
          <p style="margin:0;font-size:12px;color:#a1a1aa;">
            <a href="https://branch-chat.com" style="color:#71717a;text-decoration:underline;">branch-chat.com</a>
            &nbsp;&middot;&nbsp;
            <a href="https://branch-chat.com/privacy" style="color:#71717a;text-decoration:underline;">Privacy</a>
            &nbsp;&middot;&nbsp;
            <a href="{unsubscribe_url}" style="color:#71717a;text-decoration:underline;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _steps(items: list[str]) -> str:
    rows = "".join(
        f'<tr><td style="width:22px;vertical-align:top;color:#18181b;font-weight:700;'
        f'padding-bottom:8px;">{i}.</td>'
        f'<td style="padding-bottom:8px;">{html}</td></tr>'
        for i, html in enumerate(items, start=1)
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="{_BODY}">{rows}</table>'
    )


def _launch_body() -> str:
    bold = "color:#18181b;font-weight:600;"
    return (
        f'<div style="{_BODY}">'
        "<p style=\"margin:0 0 14px;\">Hey,</p>"
        "<p style=\"margin:0 0 14px;\">You asked us to let you know when "
        "BranchChat was ready. It's ready.</p>"
        "<p style=\"margin:0 0 14px;\">BranchChat is a different way to talk to "
        "AI. Instead of one long thread, every conversation is a tree on a "
        "canvas. Ask a question, branch into alternate paths, hand different "
        "branches to different models (Claude, GPT, and Gemini are all in), and "
        "link context between branches when one exploration should inform "
        "another.</p>"
        "</div>"
        f'<p style="{_SECTION_LABEL}">What to do now</p>'
        + _steps(
            [
                f'Go to <span style="{bold}">branch-chat.com/beta</span> and '
                "create your account.",
                "That's it. Signups go into our approval queue and we approve "
                "testers in waves, so you may not get in the same day. You'll "
                "get an email from us the moment your account is approved.",
            ]
        )
        + _email_button("Claim your beta spot", "https://branch-chat.com/beta")
        + f'<p style="{_SECTION_LABEL}">Once you\'re approved</p>'
        + _steps(
            [
                f'Go back to <span style="{bold}">branch-chat.com/beta</span> '
                "and hit Sign in, or use the Sign in link at the bottom of the "
                "home page. Either takes you straight into the app.",
                "When the cookie banner appears, please hit Accept. The "
                "analytics are privacy-first and never record your chat "
                "content, but they power our feedback tools and show us where "
                "the app confuses people, which is the whole point of a beta.",
                "Load one of the demo conversations from the sidebar to get a "
                "feel for branching, then start your own.",
            ]
        )
        + f'<p style="{_SECTION_LABEL}">What we ask of you</p>'
        + f'<div style="{_BODY}">'
        "<p style=\"margin:0 0 14px;\">This is a real beta. Things will "
        "occasionally be rough, and the way we fix them is hearing from you. "
        "There's a Feedback button at the top of the app. Use it often. Found a "
        "bug, hit something confusing, wished a feature existed, hated something "
        "we shipped: two sentences in that box is the most valuable thing you "
        "can do for us. We read every one.</p>"
        "<p style=\"margin:0 0 14px;\">We'll keep improving in waves alongside "
        "the approvals: each batch of testers comes with a batch of fixes and "
        "features driven by the feedback from the previous one.</p>"
        "<p style=\"margin:0 0 4px;\">Thanks for waiting on us. See you in the "
        "tree.</p>"
        f'<p style="margin:0;{bold}">Roshaan and Jayden<br>'
        "<span style=\"color:#52525b;font-weight:400;\">BranchChat</span></p>"
        "</div>"
    )


async def send_launch_announcement(to: str, *, unsubscribe_url: str) -> None:
    """Beta-launch blast to a waitlist contact (marketing, not transactional).

    Carries a real unsubscribe link in both the footer and the
    List-Unsubscribe header (RFC 8058 one-click), so it stays CAN-SPAM/GDPR
    clean. ``unsubscribe_url`` is per-recipient (services.unsubscribe).
    """
    await _send(
        to,
        "BranchChat is live. Come claim your beta spot",
        _marketing_layout(
            heading="BranchChat is live",
            body_html=_launch_body(),
            unsubscribe_url=unsubscribe_url,
            footnote="You're receiving this because you joined the BranchChat waitlist.",
        ),
        headers={
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )
