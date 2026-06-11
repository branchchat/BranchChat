"""Public unsubscribe endpoint for marketing email.

Linked from the footer / ``List-Unsubscribe`` header of broadcast emails. The
token IS the capability (a valid HMAC for the address — see services.unsubscribe),
so there's no auth: anyone holding the link can opt that address out, which is
exactly the point of an unsubscribe link.

* ``GET  /api/unsubscribe?token=...``  → human click; flips the flag and returns
                                          a small branded confirmation page.
* ``POST /api/unsubscribe?token=...``  → RFC 8058 one-click (the mail client posts
                                          ``List-Unsubscribe=One-Click``); flips the
                                          flag and returns 200.

Setting the flag is idempotent (only writes when currently null) and never
reveals whether the address was on the list, so the endpoint can't be used to
probe membership. An invalid/tampered token changes nothing and still renders a
neutral page rather than an error.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db, rls_tx
from app.services import unsubscribe as unsub

router = APIRouter(prefix="/api/unsubscribe", tags=["unsubscribe"])

# app_user holds the waitlist policy (TO app_user USING(true)); the update runs
# under the null RLS context like the rest of the waitlist access.
_MARK = text(
    "UPDATE waitlist SET unsubscribed_at = now() "
    "WHERE email = :email AND unsubscribed_at IS NULL"
)


async def _apply(token: str, session: AsyncSession) -> bool:
    email = unsub.verify_token(token)
    if not email:
        return False
    async with rls_tx(session, None):
        await session.execute(_MARK, {"email": email})
    return True


def _page(heading: str, body: str) -> str:
    return f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>{heading} · BranchChat</title></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:440px;margin:64px auto;padding:0 16px;">
    <div style="padding:0 8px 16px;">
      <span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:#18181b;color:#fff;
                   text-align:center;line-height:28px;font-size:14px;font-weight:700;vertical-align:middle;">B</span>
      <span style="font-size:16px;font-weight:700;color:#18181b;vertical-align:middle;padding-left:8px;">BranchChat</span>
    </div>
    <div style="background:#fff;border-radius:16px;padding:36px 32px;text-align:center;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#18181b;">{heading}</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#52525b;">{body}</p>
    </div>
  </div>
</body>
</html>"""


@router.get("", response_class=HTMLResponse)
async def unsubscribe_get(
    token: str = "",
    session: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    ok = await _apply(token, session)
    if ok:
        return HTMLResponse(
            _page(
                "You're unsubscribed",
                "You won't receive any more announcement emails from BranchChat. "
                "Account and security emails (like password resets) still work.",
            )
        )
    return HTMLResponse(
        _page(
            "Link not recognized",
            "This unsubscribe link is invalid or incomplete. If you keep getting "
            "emails, reply to one and we'll remove you by hand.",
        ),
        status_code=status.HTTP_400_BAD_REQUEST,
    )


@router.post("")
async def unsubscribe_post(
    token: str = "",
    session: AsyncSession = Depends(get_db),
) -> Response:
    # RFC 8058 one-click: the mail client just needs a 2xx. Honor a valid token,
    # ignore a bad one (still 200 so clients don't surface a scary error).
    await _apply(token, session)
    return Response(status_code=status.HTTP_200_OK)
