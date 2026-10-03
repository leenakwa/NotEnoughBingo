#!/usr/bin/env bash
set -euo pipefail

base_url="${PUBLIC_BASE_URL:-}"
bingo_id="${PUBLIC_BINGO_ID:-}"

if [[ -z "$base_url" || -z "$bingo_id" ]]; then
  echo 'Set PUBLIC_BASE_URL and PUBLIC_BINGO_ID for a known published board.' >&2
  exit 2
fi
base_url="${base_url%/}"
if [[ ! "$bingo_id" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo 'PUBLIC_BINGO_ID must be a UUID.' >&2
  exit 2
fi

if [[ "$base_url" =~ ^https://[^/?#@]+$ ]]; then
  redirect_protocol='=https'
elif [[ "${ALLOW_LOCAL_HTTP:-0}" == 1 && "$base_url" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$ ]]; then
  redirect_protocol='=http,https'
else
  echo 'PUBLIC_BASE_URL must use HTTPS; local HTTP requires ALLOW_LOCAL_HTTP=1.' >&2
  exit 2
fi

probe() {
  local path="$1"
  local expected="$2"
  local follow_redirects="${3:-0}"
  local result status final_url
  local curl_args=(--silent --show-error --connect-timeout 5 --max-time 20
    --output /dev/null --write-out '%{http_code}|%{url_effective}')
  if [[ "$follow_redirects" == 1 ]]; then
    curl_args+=(--location --max-redirs 3 --proto-redir "$redirect_protocol")
  fi
  result="$(curl "${curl_args[@]}" "$base_url$path")"
  status="${result%%|*}"
  final_url="${result#*|}"
  if [[ ! "$status" =~ ^($expected)$ ]]; then
    printf '%s: expected HTTP %s, received %s\n' "$path" "$expected" "$status" >&2
    exit 1
  fi
  if [[ "$final_url" != "$base_url"/* && "$final_url" != "$base_url" ]]; then
    printf '%s: redirected outside the public origin: %s\n' "$path" "$final_url" >&2
    exit 1
  fi
  printf '%s: HTTP %s\n' "$path" "$status"
}

probe / 200 1
probe /discover 200
probe /explore 200
probe /login 200
probe /support 200
probe "/bingo/$bingo_id" 200
probe /api/health 200
probe /api/v1/health/ready/ 200
probe /api/v1/auth/session/ 200
probe /robots.txt 200
probe /sitemap.xml 200
probe /icon.svg 200
probe /opengraph-image 200
probe "/bingo/$bingo_id/opengraph-image" 200
probe /definitely-not-a-route-smoke-check 404
probe /.env '403|404'
probe /.git/config '403|404'
probe /_next/server/app/page.js '403|404'

robots="$(curl --silent --show-error --connect-timeout 5 --max-time 20 \
  "$base_url/robots.txt")"
discover_headers="$(curl --silent --show-error --connect-timeout 5 --max-time 20 \
  --dump-header - --output /dev/null "$base_url/discover")"
discover_html="$(curl --silent --show-error --connect-timeout 5 --max-time 20 \
  "$base_url/discover")"
bingo_html="$(curl --silent --show-error --connect-timeout 5 --max-time 20 \
  "$base_url/bingo/$bingo_id")"
if [[ "$discover_html" != *"content=\"$base_url/opengraph-image\""* ]] ||
  [[ "$bingo_html" != *"content=\"$base_url/bingo/$bingo_id/opengraph-image\""* ]]; then
  echo 'Social preview images must use the canonical public origin.' >&2
  exit 1
fi
if [[ "${ALLOW_LOCAL_HTTP:-0}" == 1 ]]; then
  if [[ "$robots" != *"Disallow: /"* ]]; then
    echo 'Local preview must block crawler indexing.' >&2
    exit 1
  fi
  if ! grep -Eiq '^x-robots-tag: noindex, nofollow' <<< "$discover_headers"; then
    echo 'Local preview page must send a noindex response header.' >&2
    exit 1
  fi
else
  if [[ "$robots" != *"Sitemap: $base_url/sitemap.xml"* ]]; then
    echo 'robots.txt does not use the canonical public origin.' >&2
    exit 1
  fi
  if [[ "$robots" == *"Disallow: /"$'\n'* ]]; then
    echo 'Production robots.txt unexpectedly blocks all public pages.' >&2
    exit 1
  fi
  if [[ "$discover_html" != *"href=\"$base_url/discover\""* ]] ||
    grep -Eiq 'noindex|nofollow' <<< "$discover_headers" ||
    [[ "$discover_html" == *'name="robots" content="noindex'* ]]; then
    echo 'Production Discover has a missing canonical URL or an unexpected noindex policy.' >&2
    exit 1
  fi
fi

session_headers="$(curl --silent --show-error --connect-timeout 5 --max-time 20 \
  --dump-header - --output /dev/null "$base_url/api/v1/auth/session/")"
if ! grep -Ei '^cache-control:.*no-store' <<< "$session_headers" >/dev/null; then
  echo 'Guest session response must prevent shared caching.' >&2
  exit 1
fi

echo 'Public read-only smoke passed.'
