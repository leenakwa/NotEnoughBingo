from __future__ import annotations

import logging
from collections.abc import Iterable
from importlib import import_module

from django.conf import settings
from django.contrib.sessions.models import Session
from django.db import transaction

logger = logging.getLogger(__name__)


def invalidate_credential_session_keys(session_keys: Iterable[str]) -> None:
    """Revoke durable sessions atomically; purge their cache after commit.

    A password change invalidates the authentication hash in any cached payload,
    so a cache outage cannot make these old sessions authenticate again.
    """
    keys = tuple(dict.fromkeys(key for key in session_keys if key))
    if not keys:
        return
    Session.objects.filter(session_key__in=keys).delete()

    def purge_cache() -> None:
        session_store = import_module(settings.SESSION_ENGINE).SessionStore
        for key in keys:
            try:
                store = session_store(session_key=key)
                if hasattr(store, "_cache"):
                    store._cache.delete(store.cache_key)
            except Exception as exc:
                logger.warning(
                    "credential.session_cache_purge_failed",
                    extra={"outcome": "failed", "exception_type": type(exc).__name__},
                )

    transaction.on_commit(purge_cache)


def invalidate_session_keys(session_keys: Iterable[str]) -> None:
    """Delete sessions from both the durable store and any session cache.

    Deleting ``django_session`` rows directly is insufficient when Django uses
    ``cached_db``: a previously cached payload remains an authenticated
    session. Repeating the backend-aware deletion after commit also closes the
    race where another request repopulates the cache while the database
    transaction is still open.
    """

    keys = tuple(dict.fromkeys(key for key in session_keys if key))
    if not keys:
        return
    session_store = import_module(settings.SESSION_ENGINE).SessionStore

    def delete_from_backend() -> None:
        for key in keys:
            session_store(session_key=key).delete(key)

    delete_from_backend()
    transaction.on_commit(delete_from_backend)
