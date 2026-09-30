"""Use the application privacy formatter in both master and worker logs."""

from django.conf import settings

logconfig_dict = settings.LOGGING
accesslog = None  # Request middleware already emits query-free JSON access records.
