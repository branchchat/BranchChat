"""Model registry.

Importing this package pulls in every model so ``Base.metadata`` is complete for
Alembic autogenerate and for test schema creation.
"""

from app.models.email_token import EmailToken
from app.models.feedback import Feedback
from app.models.login_attempt import LoginAttempt
from app.models.share import ShareSnapshot
from app.models.synced_chat import SyncedChat
from app.models.usage import UsageCounter
from app.models.user import User
from app.models.waitlist import WaitlistEntry

__all__ = [
    "EmailToken",
    "Feedback",
    "LoginAttempt",
    "ShareSnapshot",
    "SyncedChat",
    "UsageCounter",
    "User",
    "WaitlistEntry",
]
