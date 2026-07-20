from django.core.exceptions import ImproperlyConfigured

from config.settings.base import *

DEBUG = False
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31_536_000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

errors: list[str] = []
if SECRET_KEY == "unsafe-development-only-change-me" or len(SECRET_KEY) < 50:
    errors.append("DJANGO_SECRET_KEY must be a unique value of at least 50 characters")
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    errors.append("ALLOWED_HOSTS must be explicit and cannot contain a wildcard")
if DATABASES["default"]["ENGINE"] == "django.db.backends.sqlite3":
    errors.append("Production requires PostgreSQL")
if not USE_S3:
    errors.append("Production requires private S3-compatible object storage")
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
if CACHES["default"]["BACKEND"] == "django.core.cache.backends.locmem.LocMemCache":
    errors.append("Production requires a shared cache for throttling and sessions")
if not SESSION_COOKIE_SECURE or not CSRF_COOKIE_SECURE:
    errors.append("Production authentication cookies must be Secure")
if SECURE_HSTS_SECONDS <= 0:
    errors.append("Production HSTS must be enabled")
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
