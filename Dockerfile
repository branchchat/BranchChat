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
# Supabase CA for full DB TLS verification (set DB_SSL_CA_FILE to this path).
COPY supabase/prod-ca-2021.crt ./supabase/prod-ca-2021.crt

# Drop root: run the app as an unprivileged user to limit blast radius of any RCE.
RUN adduser --disabled-password --gecos "" --no-create-home appuser \
    && chown -R appuser /app
USER appuser

EXPOSE 8000

# Bind the platform-provided $PORT (Railway/Render set it); default 8000 locally.
# Migrations run as a separate release step (admin/direct URL), not here.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
