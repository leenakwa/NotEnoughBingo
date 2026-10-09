from config.settings.base import *

DEBUG = True
ALLOWED_HOSTS = ["*"]
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
# The threaded development server otherwise retains one PostgreSQL connection
# per short-lived request thread and can exhaust the local connection limit.
DATABASES["default"]["CONN_MAX_AGE"] = 0
