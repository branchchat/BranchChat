from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, EmailStr, Field


class WaitlistSignup(BaseModel):
    email: EmailStr
    source: Annotated[str | None, Field(default=None, max_length=64)] = None


class WaitlistResponse(BaseModel):
    detail: str
