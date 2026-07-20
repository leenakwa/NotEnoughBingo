# Backup and restore

## Objectives

Initial production objectives:

- PostgreSQL recovery point objective (RPO): 15 minutes;
- PostgreSQL recovery time objective (RTO): 4 hours;
- object-storage RPO: 24 hours or better, with versioning/replication;
- quarterly end-to-end restore drill.

These are engineering targets, not contractual SLAs. They must be revised from
measured restore time and product/legal requirements.

Redis is not a source of truth and is rebuilt rather than restored. Application
images and infrastructure configuration are reproduced from version control
and the artifact registry. Secrets are recovered from the secret manager's
approved process, never from database dumps.

## What must be recoverable

- PostgreSQL schema and data;
- all original/normalized media referenced by retained database rows;
- generated exports still inside their promised retention window;
- object metadata/versioning needed to reconcile storage;
- release image digests and migration history;
- moderation/audit records;
- encryption-key/version metadata managed outside the dump.

Database and object-storage recovery points must be correlated. A database
restore may refer to object versions that were later deleted, so object
versioning/retention must be at least as long as the database recovery window.

## PostgreSQL production policy

Preferred:

- managed automated snapshots;
- continuous WAL archiving / point-in-time recovery;
- encrypted backups in a separate failure domain/account;
- immutable retention where available;
- daily verification that a new restore point exists;
- regular logical dump as a portability layer, not the only backup.

Monitor backup age, WAL archive failures, storage, encryption, and restore
permissions. A backup is not considered valid until it has been restored and
checked.

## Object-storage production policy

- enable bucket versioning;
- use provider replication or scheduled copy to a separate account/region;
- deny application credentials permission to destroy backup versions;
- define lifecycle separately for pending uploads, normalized media, exports,
  and backup replicas;
- keep inventory reports for reconciliation;
- test restoring exact historical object versions;
- retain legal/moderation holds where policy requires.

## Local database backup

The repository script creates a PostgreSQL custom-format dump and SHA-256 file:

```bash
make backup-db
```

Default output:

```text
backups/postgres/not-enough-bingo-YYYYMMDDTHHMMSSZ.dump
backups/postgres/not-enough-bingo-YYYYMMDDTHHMMSSZ.dump.sha256
```

Override the output directory:

```bash
BACKUP_DIR=/secure/local/path make backup-db
```

The local script is for developer recovery and staging exercises. It does not
replace managed snapshots, WAL archiving, encryption, off-site retention, or
monitoring.

## Local restore

Restore is destructive and intentionally guarded:

```bash
sha256sum -c backups/postgres/example.dump.sha256

CONFIRM_RESTORE=not-enough-bingo-local \
  make restore-db FILE=backups/postgres/example.dump
```

The script:

1. verifies confirmation and dump readability;
2. stops backend, worker, and beat;
3. drops/recreates the configured local database;
4. restores with ownership/ACL portability options;
5. runs migrations and Django deployment checks;
6. restarts application processes.

Do not run the local script against production. Production restoration requires
an incident/change record and provider-specific tooling.

macOS may expose `shasum -a 256` instead of `sha256sum`; both are acceptable for
manual verification.

## Production restore procedure

1. Declare incident/change and name the restore lead.
2. Stop or isolate writers; pause worker queues and scheduled jobs.
3. Record current release, schema migration, database timeline, and bucket
   versions.
4. Choose a recovery point immediately before the damaging event.
5. Restore PostgreSQL into a new isolated instance.
6. Run integrity queries:
   - migration graph;
   - key row counts and foreign-key checks;
   - current revision references;
   - shared result → revision consistency;
   - media references and moderation/audit continuity.
7. Restore/repoint object versions and run non-destructive reconciliation.
8. Deploy the matching compatible application image.
9. Run smoke/E2E paths using synthetic accounts.
10. Cut traffic to the restored environment.
11. Resume workers carefully; decide which idempotent tasks can replay.
12. Monitor and document actual RPO/RTO/data gaps.

Never overwrite the only damaged environment before an isolated restore is
verified.

## Restore validation checklist

- application readiness passes;
- login and session creation work;
- public/unlisted/private permission samples pass;
- a draft loads and saves;
- an old shared result renders its exact revision;
- referenced cover/background/cell images exist and decode;
- new upload and derivative processing work;
- comments/follows/likes constraints are intact;
- moderation audit log is readable;
- Celery queues and beat resume without duplicate fan-out;
- no production email is sent during isolated validation.

## Retention and deletion interaction

Backups may temporarily retain data after an account deletion. Privacy policy
must document the backup retention window and ensure deleted data is not
reintroduced into live service after restore. Maintain a deletion replay ledger
or equivalent procedure so post-backup erasure requests are re-applied.

Do not selectively edit backup archives. Expire them through documented
retention and access controls.

## Drill evidence

Each drill records:

- backup/recovery point;
- operator and environment;
- start/end time and measured RPO/RTO;
- restored row/object validation;
- application image and migration version;
- failed or manual steps;
- follow-up actions with owners and deadlines.
