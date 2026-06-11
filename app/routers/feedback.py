"""In-app beta feedback → our backend (replaces the PostHog-only path).

The widget lives behind the account gate, so feedback is always tied to a
signed-in user. Stored in the ``feedback`` table (founders read it via the
admin API) and, when ``FEEDBACK_ALERT_EMAILS`` is set, emailed to the founders
from a BackgroundTask so a note never sits unseen.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import auth_rate_limit
from app.db.session import get_db, rls_tx
from app.models import User
from app.routers.deps import current_user
from app.schemas.feedback import FeedbackCreate, FeedbackResponse
from app.services import email_service

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

_INSERT = text(
    "INSERT INTO feedback (user_id, email, category, message, path, chat_title) "
    "VALUES (:user_id, :email, :category, :message, :path, :chat_title)"
)


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    req: FeedbackCreate,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_db),
    _rl: None = Depends(auth_rate_limit),
) -> FeedbackResponse:
    async with rls_tx(session, str(user.id)):
        await session.execute(
            _INSERT,
            {
                "user_id": user.id,
                "email": user.email,
                "category": req.category,
                "message": req.message,
                "path": req.path,
                "chat_title": req.chat_title,
            },
        )
    if settings.FEEDBACK_ALERT_EMAILS:
        background.add_task(
            email_service.send_feedback_alert,
            settings.FEEDBACK_ALERT_EMAILS,
            from_email=user.email,
            category=req.category,
            message=req.message,
        )
    return FeedbackResponse(detail="Thanks — got it.")
