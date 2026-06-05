"""Model registry.

Importing this package pulls in every model so ``Base.metadata`` is complete for
Alembic autogenerate and for test schema creation.
"""

from app.models.email_token import EmailToken
from app.models.login_attempt import LoginAttempt
from app.models.share import ShareSnapshot
from app.models.usage import UsageCounter
from app.models.user import User

__all__ = [
    "EmailToken",
    "LoginAttempt",
    "ShareSnapshot",
    "UsageCounter",
    "User",
]
