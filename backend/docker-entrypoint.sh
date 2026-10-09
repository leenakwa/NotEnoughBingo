#!/bin/sh
set -eu

if [ "${WAIT_FOR_DATABASE:-0}" = "1" ]; then
  python - <<'PY'
import os
import time

import psycopg

deadline = time.monotonic() + 60
while True:
    try:
        with psycopg.connect(os.environ["DATABASE_URL"]):
            break
    except psycopg.OperationalError:
        if time.monotonic() >= deadline:
            raise
        time.sleep(1)
PY
fi

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo >&2 "RUN_MIGRATIONS is intentionally unsupported for replicated processes."
  echo >&2 "Run 'python manage.py migrate --noinput' once as the dedicated release job."
  exit 64
fi

exec "$@"
