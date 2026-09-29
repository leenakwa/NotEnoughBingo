from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

from config.settings.base import *

_configured_debug = DEBUG
DEBUG = False
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=300)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=False,
)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")


def _hostname(value: str | None) -> str:
    return (urlsplit(value).hostname or "").lower() if value else ""


local_hostnames = {"localhost", "127.0.0.1", "::1", "minio", "mailpit"}
errors: list[str] = []
if _configured_debug:
    errors.append("DEBUG must not be enabled with production settings")
if (
    SECRET_KEY
    in {
        "unsafe-development-only-change-me",
        "insecure-local-only-change-before-any-shared-environment",
    }
    or len(SECRET_KEY) < 50
):
    errors.append("DJANGO_SECRET_KEY must be a unique value of at least 50 characters")
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    errors.append("ALLOWED_HOSTS must be explicit and cannot contain a wildcard")
if DATABASES["default"]["ENGINE"] == "django.db.backends.sqlite3":
    errors.append("Production requires PostgreSQL")
if DATABASES["default"].get("PASSWORD") == "local-postgres-change-me":
    errors.append("Production cannot use the local PostgreSQL password")
if not USE_S3:
    errors.append("Production requires private S3-compatible object storage")
if USE_S3:
    if AWS_ACCESS_KEY_ID == "neb-service" or AWS_SECRET_ACCESS_KEY == "neb-service-local-change-me":
        errors.append("Production cannot use the local object-storage credentials")
    if _hostname(AWS_S3_ENDPOINT_URL) in local_hostnames:
        errors.append("Production cannot use the local MinIO endpoint")
    if AWS_S3_ENDPOINT_URL and not S3_PUBLIC_ENDPOINT_URL:
        errors.append(
            "S3_PUBLIC_ENDPOINT_URL is required when the signing endpoint is explicitly set"
        )
    if S3_PUBLIC_ENDPOINT_URL:
        public_storage_url = urlsplit(S3_PUBLIC_ENDPOINT_URL)
        if public_storage_url.scheme != "https" or not public_storage_url.netloc:
            errors.append("S3_PUBLIC_ENDPOINT_URL must be an absolute HTTPS origin")
        if _hostname(S3_PUBLIC_ENDPOINT_URL) in local_hostnames:
            errors.append("Production cannot expose the local object-storage endpoint")
if not CSRF_TRUSTED_ORIGINS:
    errors.append("CSRF_TRUSTED_ORIGINS must contain the public HTTPS origin")
if not all(origin.startswith("https://") for origin in CSRF_TRUSTED_ORIGINS):
    errors.append("Every trusted CSRF origin must use HTTPS")
if EMAIL_BACKEND in {
    "django.core.mail.backends.console.EmailBackend",
    "django.core.mail.backends.locmem.EmailBackend",
    "django.core.mail.backends.filebased.EmailBackend",
}:
    errors.append("Production requires a transactional email backend")
if EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend":
    if EMAIL_HOST.lower() in local_hostnames:
        errors.append("Production cannot use the local Mailpit/SMTP host")
    if not EMAIL_USE_TLS:
        errors.append("Production SMTP must use TLS")
if "@localhost" in DEFAULT_FROM_EMAIL.lower() or "@example.test" in DEFAULT_FROM_EMAIL.lower():
    errors.append("DEFAULT_FROM_EMAIL must use the verified production sending domain")
if not FRONTEND_URL.startswith("https://") or not urlsplit(FRONTEND_URL).netloc:
    errors.append("FRONTEND_URL must be the absolute public HTTPS origin")
if CACHES["default"]["BACKEND"] == "django.core.cache.backends.locmem.LocMemCache":
    errors.append("Production requires a shared cache for throttling and sessions")
if not SESSION_COOKIE_SECURE or not CSRF_COOKIE_SECURE:
    errors.append("Production authentication cookies must be Secure")
if SECURE_HSTS_SECONDS <= 0:
    errors.append("Production HSTS must be enabled")
if SECURE_HSTS_PRELOAD and (not SECURE_HSTS_INCLUDE_SUBDOMAINS or SECURE_HSTS_SECONDS < 31_536_000):
    errors.append(
        "HSTS preload requires includeSubDomains and at least one year only after staged rollout"
    )
if not SECURE_SSL_REDIRECT:
    errors.append("Production must redirect plain HTTP requests to HTTPS")
if TRUSTED_PROXY_HOPS < 1:
    errors.append("TRUSTED_PROXY_HOPS must describe the trusted ingress chain")
if "*" in CORS_ALLOWED_ORIGINS:
    errors.append("CORS_ALLOWED_ORIGINS cannot contain a wildcard")
if any(not origin.startswith("https://") for origin in CORS_ALLOWED_ORIGINS):
    errors.append("Every configured CORS origin must use HTTPS")
if errors:
    raise ImproperlyConfigured("; ".join(errors))
