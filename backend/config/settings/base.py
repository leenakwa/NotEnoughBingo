from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parents[2]
env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    CORS_ALLOWED_ORIGINS=(list, []),
    CSRF_TRUSTED_ORIGINS=(list, []),
)

env_file = BASE_DIR.parent / ".env"
if env_file.exists():
    environ.Env.read_env(env_file)

SECRET_KEY = env("DJANGO_SECRET_KEY", default="unsafe-development-only-change-me")
DEBUG = env.bool("DEBUG")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]
THIRD_PARTY_APPS = [
    "corsheaders",
    "django_celery_beat",
    "django_filters",
    "drf_spectacular",
    "rest_framework",
]
LOCAL_APPS = [
    "apps.common",
    "apps.accounts",
    "apps.media_assets",
    "apps.bingos",
    "apps.plays",
    "apps.social",
    "apps.notifications",
    "apps.analytics",
    "apps.moderation",
    "apps.exports",
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "apps.common.middleware.RequestIdMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.accounts.middleware.SessionMetadataMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.common.middleware.SecurityHeadersMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

DATABASES = {"default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["apps.accounts.backends.ActiveAccountBackend"]
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

CACHES = {
    "default": {
        "BACKEND": env("CACHE_BACKEND", default="django.core.cache.backends.locmem.LocMemCache"),
        "LOCATION": env("REDIS_URL", default="not-enough-bingo"),
        "TIMEOUT": 300,
        "OPTIONS": {},
    }
}
if CACHES["default"]["BACKEND"] == "django.core.cache.backends.redis.RedisCache":
    CACHES["default"]["OPTIONS"] = {"socket_connect_timeout": 2, "socket_timeout": 2}

SESSION_ENGINE = "django.contrib.sessions.backends.cached_db"
SESSION_COOKIE_NAME = "neb_session"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=False)
SESSION_COOKIE_AGE = env.int("SESSION_COOKIE_AGE", default=60 * 60 * 24 * 30)
SESSION_SAVE_EVERY_REQUEST = False
CSRF_COOKIE_NAME = "neb_csrf"
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=False)
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS")

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True
TRUSTED_PROXY_HOPS = env.int("TRUSTED_PROXY_HOPS", default=0)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.common.authentication.StrictSessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticatedOrReadOnly"],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardCursorPagination",
    "PAGE_SIZE": 24,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
        "rest_framework.filters.SearchFilter",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/min",
        "user": "600/min",
        "auth_login": env("AUTH_LOGIN_RATE_LIMIT", default="5/min"),
        "auth_register": env("AUTH_REGISTER_RATE_LIMIT", default="5/hour"),
        "auth_verify": env(
            "AUTH_EMAIL_VERIFICATION_RATE_LIMIT",
            default="5/hour",
        ),
        "password_reset": env(
            "AUTH_PASSWORD_RESET_RATE_LIMIT",
            default="3/hour",
        ),
        "comments": env("COMMENT_RATE_LIMIT", default="10/min"),
        "reports": env("REPORT_RATE_LIMIT", default="5/hour"),
        "uploads": env("UPLOAD_RATE_LIMIT", default="30/hour"),
        "interactions": "300/min",
    },
    "COERCE_DECIMAL_TO_STRING": False,
    "NUM_PROXIES": TRUSTED_PROXY_HOPS,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Not Enough Bingo API",
    "DESCRIPTION": "Versioned API for creating, playing, sharing and moderating bingo boards.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "AccountDeletionStatus": [
            ("scheduled", "Scheduled"),
            ("cancelled", "Cancelled"),
            ("processing", "Processing"),
            ("complete", "Complete"),
            ("failed", "Failed"),
        ],
        "BingoStatus": [
            ("draft", "Draft"),
            ("published", "Published"),
            ("archived", "Archived"),
        ],
        "ExportStatus": [
            ("queued", "Queued"),
            ("processing", "Processing"),
            ("ready", "Ready"),
            ("failed", "Failed"),
            ("expired", "Expired"),
        ],
        "MediaAssetStatus": [
            ("pending", "Pending upload"),
            ("uploaded", "Uploaded"),
            ("processing", "Processing"),
            ("ready", "Ready"),
            ("rejected", "Rejected"),
            ("quarantined", "Quarantined"),
            ("deleted", "Deleted"),
        ],
        "MarkingStyleEnum": [
            ("checkmark", "Checkmark"),
            ("crossout", "Crossout"),
            ("highlight", "Highlight"),
        ],
        "ReportStatus": [
            ("open", "Open"),
            ("in_review", "In review"),
            ("resolved", "Resolved"),
            ("dismissed", "Dismissed"),
        ],
    },
}

EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=1025)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=False)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Not Enough Bingo <noreply@example.test>")
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000").rstrip("/")

CELERY_BROKER_URL = env(
    "CELERY_BROKER_URL", default=env("REDIS_URL", default="redis://localhost:6379/0")
)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default=CELERY_BROKER_URL)
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = env.int("CELERY_TASK_TIME_LIMIT_SECONDS", default=900)
CELERY_TASK_SOFT_TIME_LIMIT = env.int(
    "CELERY_TASK_SOFT_TIME_LIMIT_SECONDS",
    default=840,
)
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_BEAT_SCHEDULE = {
    "cleanup-orphaned-media-hourly": {
        "task": "apps.media_assets.tasks.cleanup_orphaned_media",
        "schedule": timedelta(hours=1),
    },
    "recompute-trending-quarter-hourly": {
        "task": "apps.analytics.tasks.recompute_trending_scores",
        "schedule": timedelta(minutes=15),
    },
    "process-account-deletions-daily": {
        "task": "apps.accounts.tasks.process_scheduled_account_deletions",
        "schedule": timedelta(hours=24),
    },
    "cleanup-idempotency-daily": {
        "task": "apps.common.tasks.cleanup_expired_idempotency_records",
        "schedule": timedelta(hours=24),
    },
    "expire-export-assets-hourly": {
        "task": "apps.exports.tasks.expire_export_jobs",
        "schedule": timedelta(hours=1),
    },
    "cleanup-expired-auth-records-daily": {
        "task": "apps.accounts.tasks.cleanup_expired_auth_records",
        "schedule": timedelta(hours=24),
    },
}

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
USE_S3 = env.bool("USE_S3", default=False)
if USE_S3:
    STORAGES["default"] = {"BACKEND": "storages.backends.s3.S3Storage"}
    AWS_ACCESS_KEY_ID = env("S3_ACCESS_KEY")
    AWS_SECRET_ACCESS_KEY = env("S3_SECRET_KEY")
    AWS_STORAGE_BUCKET_NAME = env("S3_BUCKET")
    AWS_S3_ENDPOINT_URL = env("S3_ENDPOINT_URL", default=None)
    S3_PUBLIC_ENDPOINT_URL = env("S3_PUBLIC_ENDPOINT_URL", default="")
    AWS_S3_REGION_NAME = env("S3_REGION", default="us-east-1")
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = True
    AWS_QUERYSTRING_EXPIRE = 900
    AWS_S3_FILE_OVERWRITE = False

MAX_UPLOAD_BYTES = env.int("MAX_UPLOAD_BYTES", default=15 * 1024 * 1024)
MAX_CELL_IMAGES_PER_BINGO = env.int("MAX_CELL_IMAGES_PER_BINGO", default=100)
MEDIA_UPLOAD_URL_TTL_SECONDS = env.int(
    "MEDIA_UPLOAD_URL_TTL_SECONDS",
    default=900,
)
MEDIA_ORPHAN_RETENTION_HOURS = env.int(
    "MEDIA_ORPHAN_RETENTION_HOURS",
    default=24,
)
MEDIA_MAX_ACTIVE_UPLOAD_INTENTS = env.int(
    "MEDIA_MAX_ACTIVE_UPLOAD_INTENTS",
    default=100,
)
ALLOWED_IMAGE_MIME_TYPES = set(
    env.list(
        "MEDIA_ALLOWED_MIME_TYPES",
        default=["image/jpeg", "image/png", "image/webp", "image/avif"],
    )
)
MEDIA_AVATAR_MAX_BYTES = env.int(
    "MEDIA_AVATAR_MAX_BYTES",
    default=5 * 1024 * 1024,
)
MEDIA_COVER_MAX_BYTES = env.int(
    "MEDIA_COVER_MAX_BYTES",
    default=8 * 1024 * 1024,
)
MEDIA_BACKGROUND_MAX_BYTES = env.int(
    "MEDIA_BACKGROUND_MAX_BYTES",
    default=12 * 1024 * 1024,
)
MEDIA_CELL_MAX_BYTES = env.int(
    "MEDIA_CELL_IMAGE_MAX_BYTES",
    default=5 * 1024 * 1024,
)
ACCOUNT_EXPORT_RETENTION_HOURS = env.int(
    "ACCOUNT_EXPORT_RETENTION_HOURS",
    default=24,
)
ACCOUNT_DELETION_GRACE_DAYS = env.int("ACCOUNT_DELETION_GRACE_DAYS", default=14)
EMAIL_VERIFICATION_TTL_SECONDS = env.int(
    "EMAIL_VERIFICATION_TTL_SECONDS",
    default=86_400,
)
EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = env.int(
    "EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS",
    default=60,
)
EMAIL_VERIFICATION_MAX_PER_DAY = env.int(
    "EMAIL_VERIFICATION_MAX_PER_DAY",
    default=10,
)
PASSWORD_RESET_TIMEOUT = env.int("PASSWORD_RESET_TTL_SECONDS", default=3_600)

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"

LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "apps.common.logging.JsonFormatter",
        }
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "json"}},
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}

SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=env("SENTRY_ENVIRONMENT", default="development"),
        send_default_pii=False,
        traces_sample_rate=env.float("SENTRY_TRACES_SAMPLE_RATE", default=0.05),
    )
