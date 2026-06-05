"""SQLAlchemy declarative base.

Models import ``Base`` from here; ``app.models`` imports every model so that
``Base.metadata`` is fully populated for Alembic and test schema creation.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
