from __future__ import annotations

import os
import secrets
import shlex
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _production_image_environment() -> dict[str, str]:
    dockerfile = (BACKEND_DIR / "Dockerfile").read_text()
    production_stage = dockerfile.split("FROM python-base AS production\n", 1)[1]
    environment = {}
    for line in production_stage.replace("\\\n", " ").splitlines():
        if line.startswith("ENV "):
            environment.update(item.split("=", 1) for item in shlex.split(line[4:]))
    return environment


@pytest.mark.parametrize(
    ("debug", "allowed_hosts", "error"),
    [
        ("false", "*", "ALLOWED_HOSTS must be explicit and cannot contain a wildcard"),
        ("true", "bingo.invalid", "DEBUG must not be enabled with production settings"),
    ],
)
def test_image_settings_reject_unsafe_gunicorn_startup(debug, allowed_hosts, error):
    # Use image defaults rather than pytest's settings or the developer's environment.
    environment = {
        "PATH": os.environ["PATH"],
        "APP_ENVIRONMENT": "production",
        "DEBUG": debug,
        "ALLOWED_HOSTS": allowed_hosts,
        "DATABASE_URL": "sqlite:///:memory:",
        "USE_S3": "false",
        **_production_image_environment(),
    }
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "gunicorn",
            "config.wsgi:application",
            "--config",
            "python:config.gunicorn",
            "--check-config",
        ],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode != 0
    assert error in result.stderr


ENTRYPOINTS = [
    "import config.gunicorn",
    "import config.wsgi",
    "import config.asgi",
    "from config.celery import app; app.conf.broker_url",
]


@pytest.mark.parametrize("entrypoint", ENTRYPOINTS)
@pytest.mark.parametrize(
    ("valid_configuration", "settings_module"),
    [(False, None), (True, None), (True, "config.settings.development")],
)
def test_server_entrypoints_settings_selection(entrypoint, valid_configuration, settings_module):
    # Exercise package/Celery import order without inheriting pytest's settings.
    environment = {
        "PATH": os.environ["PATH"],
        "APP_ENVIRONMENT": "production",
        "DEBUG": "false",
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(48),
        "ALLOWED_HOSTS": "bingo.invalid" if valid_configuration else "*",
        "DATABASE_URL": "postgresql://postgres.invalid/bingo",
        "USE_S3": "true",
        "S3_ACCESS_KEY": secrets.token_urlsafe(24),
        "S3_SECRET_KEY": secrets.token_urlsafe(24),
        "S3_BUCKET": "test-bucket",
        "CSRF_TRUSTED_ORIGINS": "https://bingo.invalid",
        "FRONTEND_URL": "https://bingo.invalid",
        "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
        "EMAIL_HOST": "smtp.bingo.invalid",
        "EMAIL_USE_TLS": "true",
        "DEFAULT_FROM_EMAIL": "support@bingo.invalid",
        "CACHE_BACKEND": "django.core.cache.backends.redis.RedisCache",
        "REDIS_URL": "redis://redis.invalid/0",
        "TRUSTED_PROXY_HOPS": "1",
    }
    if settings_module:
        environment["DJANGO_SETTINGS_MODULE"] = settings_module
    result = subprocess.run(  # noqa: S603 - entrypoint is a fixed test parameter.
        [
            sys.executable,
            "-c",
            f"{entrypoint}; from django.conf import settings; "
            "print(settings.SETTINGS_MODULE, settings.DEBUG, settings.ALLOWED_HOSTS)",
        ],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if valid_configuration:
        assert result.returncode == 0, result.stderr
        expected = (
            "config.settings.development True ['*']"
            if settings_module
            else "config.settings.production False ['bingo.invalid']"
        )
        assert expected in result.stdout
    else:
        assert result.returncode != 0
        assert "ALLOWED_HOSTS must be explicit and cannot contain a wildcard" in result.stderr
