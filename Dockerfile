# Backend image (Railway / any container host).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

EXPOSE 8000

# Migrations are run as a separate release step (admin/direct URL), not here.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
