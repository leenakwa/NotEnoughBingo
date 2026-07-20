#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "$#" -ne 1 ]]; then
  echo "Usage: CONFIRM_RESTORE=not-enough-bingo-local $0 <backup.dump>" >&2
  exit 2
fi

if [[ "${CONFIRM_RESTORE:-}" != "not-enough-bingo-local" ]]; then
  echo "Restore refused. Set CONFIRM_RESTORE=not-enough-bingo-local." >&2
  exit 2
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backup_file="$1"

if [[ ! -r "${backup_file}" ]]; then
  echo "Backup is not readable: ${backup_file}" >&2
  exit 2
fi

backup_dir="$(cd "$(dirname "${backup_file}")" && pwd)"
backup_file="${backup_dir}/$(basename "${backup_file}")"
checksum_file="${backup_file}.sha256"

if [[ -r "${checksum_file}" ]]; then
  if command -v sha256sum >/dev/null 2>&1; then
    (
      cd "${backup_dir}"
      sha256sum --check "$(basename "${checksum_file}")"
    )
  elif command -v shasum >/dev/null 2>&1; then
    (
      cd "${backup_dir}"
      shasum -a 256 --check "$(basename "${checksum_file}")"
    )
  else
    echo "A checksum exists but no SHA-256 verification tool is available." >&2
    exit 1
  fi
else
  echo "Warning: no adjacent checksum file found at ${checksum_file}" >&2
fi

compose=(
  docker compose
  --project-directory "${root_dir}"
  -f "${root_dir}/compose.yml"
)

"${compose[@]}" exec -T postgres pg_restore --list <"${backup_file}" >/dev/null

restore_succeeded=0
on_exit() {
  if [[ "${restore_succeeded}" -eq 1 ]]; then
    "${compose[@]}" up -d backend worker beat frontend proxy >/dev/null
  else
    echo "Restore failed; application writers remain stopped for inspection." >&2
  fi
}
trap on_exit EXIT

"${compose[@]}" stop backend worker beat frontend proxy

# shellcheck disable=SC2016
"${compose[@]}" exec -T postgres sh -ceu '
  dropdb \
    --if-exists \
    --force \
    --username "$POSTGRES_USER" \
    "$POSTGRES_DB"
  createdb \
    --username "$POSTGRES_USER" \
    --owner "$POSTGRES_USER" \
    "$POSTGRES_DB"
'

# shellcheck disable=SC2016
"${compose[@]}" exec -T postgres sh -ceu '
  pg_restore \
    --exit-on-error \
    --no-owner \
    --no-privileges \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB"
' <"${backup_file}"

"${compose[@]}" run --rm backend python manage.py migrate --noinput
"${compose[@]}" run --rm backend python manage.py check

restore_succeeded=1
echo "Restore completed from: ${backup_file}"
