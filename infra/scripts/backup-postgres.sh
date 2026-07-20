#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backup_root="${BACKUP_DIR:-${root_dir}/backups}"
output_dir="${backup_root}/postgres"
retention_days="${BACKUP_RETENTION_DAYS:-14}"

if [[ ! "${retention_days}" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a non-negative integer." >&2
  exit 2
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_file="${output_dir}/not-enough-bingo-${timestamp}.dump"
partial_file="${output_file}.partial"

cleanup() {
  rm -f "${partial_file}"
}
trap cleanup EXIT

mkdir -p "${output_dir}"

docker compose \
  --project-directory "${root_dir}" \
  -f "${root_dir}/compose.yml" \
  exec -T postgres \
  sh -ceu 'pg_dump \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges' >"${partial_file}"

mv "${partial_file}" "${output_file}"

if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "${output_dir}"
    sha256sum "$(basename "${output_file}")" >"$(basename "${output_file}").sha256"
  )
elif command -v shasum >/dev/null 2>&1; then
  (
    cd "${output_dir}"
    shasum -a 256 "$(basename "${output_file}")" >"$(basename "${output_file}").sha256"
  )
else
  echo "No SHA-256 tool found; backup was created without a checksum." >&2
  exit 1
fi

find "${output_dir}" -type f \
  \( -name 'not-enough-bingo-*.dump' -o -name 'not-enough-bingo-*.dump.sha256' \) \
  -mtime "+${retention_days}" -delete

echo "Backup created: ${output_file}"
echo "Checksum: ${output_file}.sha256"
