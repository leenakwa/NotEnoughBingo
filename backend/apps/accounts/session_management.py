from __future__ import annotations

from collections.abc import Iterable
from importlib import import_module

from django.conf import settings
from django.db import transaction


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
