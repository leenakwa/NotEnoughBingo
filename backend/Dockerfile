FROM python:3.13-slim AS python-base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

FROM python-base AS builder

# Compilers and development headers stay in this build-only stage.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential libjpeg62-turbo-dev libpq-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv "${VIRTUAL_ENV}"

COPY pyproject.toml ./
COPY apps ./apps
COPY config ./config
COPY manage.py ./

# Versions are constrained centrally by pyproject.toml.
# hadolint ignore=DL3013
RUN python -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && python -m pip install --no-cache-dir .

FROM builder AS development

# Development tool versions are constrained centrally by pyproject.toml.
# hadolint ignore=DL3013
RUN python -m pip install --no-cache-dir ".[dev]"

COPY . .
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

FROM python-base AS production

# Runtime libraries only; build tools never reach the production image.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install --no-install-recommends -y libjpeg62-turbo libpq5 zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app apps ./apps
COPY --chown=app:app config ./config
COPY --chown=app:app manage.py ./
COPY --chown=app:app docker-entrypoint.sh ./

RUN chmod +x /app/docker-entrypoint.sh \
    && DEBUG=false \
       DJANGO_SECRET_KEY=build-time-only-not-used-at-runtime \
       ALLOWED_HOSTS=localhost \
       CSRF_TRUSTED_ORIGINS=http://localhost \
       CORS_ALLOWED_ORIGINS=http://localhost \
       USE_S3=false \
       python manage.py collectstatic --noinput

USER app

EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--threads", "2", "--timeout", "60", "--graceful-timeout", "30", "--keep-alive", "5", "--max-requests", "1000", "--max-requests-jitter", "100", "--access-logfile", "-", "--error-logfile", "-"]
