from __future__ import annotations

import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest
from django.conf import settings


def _production_environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment.update(
        {
            "DJANGO_SETTINGS_MODULE": "config.settings.production",
            "APP_ENVIRONMENT": "production",
            "DEBUG": "false",
            "DJANGO_SECRET_KEY": "production-test-secret-" + "x" * 64,
            "DJANGO_SECRET_KEY_FALLBACKS": "",
            "ALLOWED_HOSTS": "app.example.test",
            "CSRF_TRUSTED_ORIGINS": "https://app.example.test",
            "CORS_ALLOWED_ORIGINS": "",
            "DATABASE_URL": ("postgresql://app:production-test-password@db.internal:5432/app"),
            "REDIS_URL": "rediss://redis.internal:6379/0",
            "CACHE_BACKEND": "django.core.cache.backends.redis.RedisCache",
            "CELERY_BROKER_URL": "rediss://redis.internal:6379/1",
            "CELERY_RESULT_BACKEND": "rediss://redis.internal:6379/2",
            "USE_S3": "true",
            "S3_ACCESS_KEY": "production-test-access-key",
            "S3_SECRET_KEY": "production-test-secret-key",
            "S3_BUCKET": "production-test-bucket",
            "S3_ENDPOINT_URL": "https://s3.example.test",
            "S3_PUBLIC_ENDPOINT_URL": "https://media.example.test",
            "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
            "EMAIL_HOST": "smtp.example.test",
            "EMAIL_USE_TLS": "true",
            "DEFAULT_FROM_EMAIL": "Not Enough Bingo <no-reply@example.com>",
            "FRONTEND_URL": "https://app.example.test",
            "SECURE_SSL_REDIRECT": "true",
            "SECURE_HSTS_SECONDS": "300",
            "SECURE_HSTS_INCLUDE_SUBDOMAINS": "false",
            "SECURE_HSTS_PRELOAD": "false",
            "TRUSTED_PROXY_HOPS": "1",
        }
    )
    return environment


def _load_production_settings(environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from django.conf import settings; "
                "print(settings.SECURE_HSTS_SECONDS, settings.SECURE_HSTS_PRELOAD)"
            ),
        ],
        cwd=settings.BASE_DIR,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )


def test_secure_production_environment_loads_with_staged_hsts() -> None:
    result = _load_production_settings(_production_environment())

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "300 False"


def test_production_rejects_debug_and_known_local_credentials() -> None:
    environment = _production_environment()
    environment.update(
        {
            "DEBUG": "true",
            "DJANGO_SECRET_KEY": "insecure-local-only-change-before-any-shared-environment",
            "DATABASE_URL": ("postgresql://app:local-postgres-change-me@db.internal:5432/app"),
            "S3_ACCESS_KEY": "neb-service",
            "S3_SECRET_KEY": "neb-service-local-change-me",
        }
    )

    result = _load_production_settings(environment)

    assert result.returncode != 0
    assert "DEBUG must not be enabled" in result.stderr
    assert "DJANGO_SECRET_KEY" in result.stderr
    assert "local PostgreSQL password" in result.stderr
    assert "local object-storage credentials" in result.stderr


def test_production_rejects_premature_hsts_preload() -> None:
    environment = _production_environment()
    environment["SECURE_HSTS_PRELOAD"] = "true"

    result = _load_production_settings(environment)

    assert result.returncode != 0
    assert "HSTS preload requires includeSubDomains" in result.stderr


def test_production_accepts_previous_strong_key_for_rotation() -> None:
    environment = _production_environment()
    environment["DJANGO_SECRET_KEY_FALLBACKS"] = secrets.token_urlsafe(48)

    result = _load_production_settings(environment)

    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    "fallback",
    ["short-test-key", "insecure-local-only-change-before-any-shared-environment"],
)
def test_production_rejects_unsafe_fallback_without_exposing_it(fallback: str) -> None:
    environment = _production_environment()
    environment["DJANGO_SECRET_KEY_FALLBACKS"] = fallback

    result = _load_production_settings(environment)

    assert result.returncode != 0
    assert "DJANGO_SECRET_KEY_FALLBACKS" in result.stderr
    assert fallback not in result.stderr


def test_production_rejects_environment_and_public_origin_mismatch() -> None:
    environment = _production_environment()
    environment.update(
        {
            "APP_ENVIRONMENT": "staging",
            "ALLOWED_HOSTS": "other.example.test",
            "CSRF_TRUSTED_ORIGINS": "https://other.example.test",
            "FRONTEND_URL": "https://app.example.test",
        }
    )

    result = _load_production_settings(environment)

    assert result.returncode != 0
    assert "APP_ENVIRONMENT must be production" in result.stderr
    assert "ALLOWED_HOSTS must include the FRONTEND_URL hostname" in result.stderr
    assert "CSRF_TRUSTED_ORIGINS must include FRONTEND_URL" in result.stderr


@pytest.mark.parametrize(
    ("name", "value", "message"),
    [
        (
            "CSRF_TRUSTED_ORIGINS",
            "https://app.example.test,https://localhost:3000",
            "Production CSRF origins cannot use local hostnames",
        ),
        (
            "CORS_ALLOWED_ORIGINS",
            "https://127.0.0.1:3000",
            "Production CORS origins cannot use local hostnames",
        ),
    ],
)
def test_production_rejects_local_security_origins(name: str, value: str, message: str) -> None:
    environment = _production_environment()
    environment[name] = value

    result = _load_production_settings(environment)

    assert result.returncode != 0
    assert message in result.stderr


def test_nginx_normalizes_forwarded_identity_and_scheme() -> None:
    repository_root = Path(__file__).resolve().parents[4]
    template_path = repository_root / "infra/nginx/templates/default.conf.template"
    if not template_path.exists():
        pytest.skip("Nginx template is outside the backend container; foundation CI validates it")
    template = template_path.read_text()

    assert "set_real_ip_from ${NGINX_TRUSTED_PROXY_CIDR};" in template
    assert "proxy_set_header X-Forwarded-For $remote_addr;" in template
    assert "proxy_set_header X-Forwarded-Proto ${NGINX_FORWARDED_PROTO};" in template
    assert "$proxy_add_x_forwarded_for" not in template
