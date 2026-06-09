"""Auth request/response schemas.

Pydantic + ``EmailStr`` reject malformed signups at the edge (422). Login takes a
bounded plain string (no min-length echo of the policy — we don't want the login
form to reveal the password rules or anything about the account).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.config import settings

Password = Annotated[
    str, Field(min_length=settings.PASSWORD_MIN_LENGTH, max_length=200)
]


class SignupRequest(BaseModel):
    email: EmailStr
    password: Password


class LoginRequest(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=200)]


class RequestPasswordReset(BaseModel):
    email: EmailStr


class ResetPassword(BaseModel):
    token: Annotated[str, Field(min_length=1, max_length=400)]
    password: Password


class VerifyEmail(BaseModel):
    token: Annotated[str, Field(min_length=1, max_length=400)]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    email_verified: bool
    created_at: datetime


class MessageOut(BaseModel):
    detail: str


class UsageBucket(BaseModel):
    used: int
    limit: int
    remaining: int


class UsageStatus(BaseModel):
    authenticated: bool
    kind: str
    used: int
    limit: int
    remaining: int
    coding: UsageBucket
