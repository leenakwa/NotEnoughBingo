#!/usr/bin/env bash
set -euo pipefail

# This intentionally stops the frontend. Run only in the isolated E2E stack.
if [[ "${E2E_LIVE:-0}" != 1 || "${APP_ENVIRONMENT:-development}" == production ]]; then
  echo 'Proxy fault verification requires the isolated E2E stack.' >&2
  exit 2
fi
neb_probe_origin="${PLAYWRIGHT_BASE_URL:-http://localhost:8080}"
if [[ ! "$neb_probe_origin" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$ ]]; then
  echo 'Proxy fault verification only permits a local HTTP origin.' >&2
  exit 2
fi
neb_probe_directory="$(mktemp -d)"
neb_probe_started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
neb_probe_frontend="$(docker compose ps -a -q frontend)"
if [[ ! "$neb_probe_frontend" =~ ^[a-f0-9]{64}$ ]]; then
  rm -rf "$neb_probe_directory"
  echo 'Proxy verification requires exactly one existing E2E frontend container.' >&2
  exit 2
fi
restore_frontend() {
  # Keep the existing environment and do not restart initializer/dependency jobs.
  docker start "$neb_probe_frontend" >/dev/null
  rm -rf "$neb_probe_directory"
}
trap restore_frontend EXIT
docker compose stop frontend >/dev/null
for neb_probe_path in '/reset-password?token=neb-proxy-private-marker' '/explore?q=neb-proxy-private-marker'; do
  neb_probe_status="$(curl --silent --show-error --connect-timeout 8 --max-time 15 \
    --dump-header "$neb_probe_directory/headers" --output "$neb_probe_directory/body" \
    --write-out '%{http_code}' "$neb_probe_origin$neb_probe_path")"
  if [[ ! "$neb_probe_status" =~ ^(502|503|504)$ ]]; then
    echo 'The proxy did not report an upstream failure.' >&2
    exit 1
  fi
  grep -q 'This page is temporarily unavailable' "$neb_probe_directory/body"
  grep -qi '^cache-control: no-store' "$neb_probe_directory/headers"
  grep -qi '^referrer-policy: no-referrer' "$neb_probe_directory/headers"
done
docker compose logs --since "$neb_probe_started" proxy > "$neb_probe_directory/logs" 2>&1
if grep -q 'neb-proxy-private-marker' "$neb_probe_directory/logs"; then
  echo 'A query value escaped into proxy logs.' >&2
  exit 1
fi
grep -q '"uri":"/reset-password"' "$neb_probe_directory/logs"
grep -q '"uri":"/explore"' "$neb_probe_directory/logs"
docker start "$neb_probe_frontend" >/dev/null
neb_probe_recovered=0
for ((neb_probe_attempt = 0; neb_probe_attempt < 30; neb_probe_attempt++)); do
  if curl --fail --silent --connect-timeout 5 --max-time 10 \
    "$neb_probe_origin/discover" > "$neb_probe_directory/recovered" \
    && ! grep -q 'This page is temporarily unavailable' "$neb_probe_directory/recovered"; then
    neb_probe_recovered=1
    break
  fi
  sleep 2
done
if [[ "$neb_probe_recovered" != 1 ]]; then
  echo 'The frontend did not recover after restarting its existing container.' >&2
  exit 1
fi
echo 'Proxy outage recovery, cache/referrer headers, and query redaction passed.'
