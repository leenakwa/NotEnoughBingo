# Operations runbook

## Environment model

Use separate development, test, staging, and production environments with
separate databases, Redis, buckets, email credentials, domains, and
error-tracking environments. Production data must never be copied into local
development without a documented anonymization process.

`compose.yml` is the local topology. Production deploys immutable images and
normally uses managed PostgreSQL, Redis, object storage, mail, and ingress.

## Configuration rules

- All settings are environment driven and validated at process start.
- Production refuses debug mode, default/short secrets, wildcard hosts,
  insecure cookies, missing HTTPS configuration, or local email/storage
  backends.
- Secrets come from a secret manager and are injected at runtime.
- Public frontend variables contain no secret.
- Configuration changes are reviewed and auditable.
- Image references use immutable digests in production.
- The supported production ingress normalizes the chain at Nginx. Configure
  the load-balancer source CIDR and asserted public scheme there; Django then
  receives exactly one canonical `X-Forwarded-For` value and keeps
  `TRUSTED_PROXY_HOPS=1`. See the
  [production deployment baseline](production-deployment.md).

## Process types

| Process | Scale | Notes |
| --- | --- | --- |
| Next.js frontend | horizontal | stateless |
| Django web | horizontal | stateless; bounded worker/timeouts |
| Celery worker | horizontal by queue | separate heavy export/media queue as load grows |
| Celery beat | exactly one | prevent duplicate schedules |
| PostgreSQL | managed HA preferred | source of truth |
| Redis | managed HA preferred | disposable cache/broker with task-delivery policy |
| Object storage | managed/durable | versioning and lifecycle enabled |

## Health checks

- `/healthz` checks the local Nginx process.
- `/api/health` checks the Next.js process inside its container.
- `/api/v1/health/live/` checks Django process liveness.
- `/api/v1/health/ready/` checks database connectivity, required migration
  compatibility, Redis when required for serving, and critical configuration.
- `/api/v1/health/beat/` returns `200` only when the scheduled Celery Beat
  heartbeat has been observed within three minutes.
- Readiness must be fast, bounded, and must not mutate data.
- Storage/email degradation appears in telemetry but should not necessarily
  remove read-only web capacity.
- Worker health uses a targeted Celery ping and queue-age alerting.
- Beat health uses process liveness plus a heartbeat task observed externally.

Container health is a local convenience; production orchestrator probes and
external synthetic checks remain authoritative.

## Initial local startup

```bash
cp .env.example .env
docker compose config --quiet
docker compose build
docker compose up -d postgres redis minio mailpit
docker compose run --rm backend python manage.py migrate
docker compose up -d
docker compose ps
```

Create local-only sample data:

```bash
docker compose exec backend python manage.py seed_dev
```

`seed_dev` is deliberately blocked outside debug mode. Never copy its users,
password, or synthetic engagement into staging or production.

## Launch-content workflow

Prepare the first public catalog through the real product workflow instead of
running a production seed:

1. Register a named editorial account with a role mailbox, verify its email,
   enable the staff access controls used by the deployment, and store its
   credential in the production secret manager.
2. Create and review a small, varied set of genuine boards in the editor. Check
   every cell, image licence, tag, description, mobile layout, and visibility
   while each board is still a private draft.
3. Publish the approved boards normally. Do not manufacture likes, follows,
   plays, shares, or ranking events; Discover can surface newly published
   catalog content without fake engagement.
4. In a logged-out browser, verify Discover, Trending's honest empty/low-data
   state, Explore search/tag filters, each public board, its social preview,
   and one immutable shared result. Private review drafts must remain absent
   from all public endpoints and the sitemap.
5. Record the editorial owner and board URLs in the release evidence. Revoke
   temporary setup sessions and rotate any credential that was exposed during
   launch preparation.

Repeat this reviewed workflow when curating seasonal content. Production boot
must never create users or content automatically; an empty catalog remains a
supported UI state if all curated boards are later archived.

## Release procedure

1. CI passes lint, formatting, typecheck, unit/integration and browser tests,
   dependency/secret/image scans, OpenAPI/migration/config validation,
   non-root image assertions, and SBOM generation.
2. Build frontend/backend once and publish by immutable digest.
3. Deploy compatible additive migrations before application rollout.
4. Start one release/migration job; never run migrations concurrently in every
   web replica.
5. Roll out web and worker processes gradually.
6. Verify readiness, error rate, latency, queue age, login, public bingo read,
   and one synthetic upload.
7. Enable new scheduled jobs only after compatible workers are present.
8. Record image digests, schema version, operator, time, and links to telemetry.

Destructive schema contraction occurs in a later release after old code no
longer reads the field/table.

The backend entrypoint rejects `RUN_MIGRATIONS=1`. Invoke `python manage.py
migrate --noinput` as the explicit one-shot release command instead.

## Rollback

- Roll back to prior immutable images.
- Do not reverse a destructive migration during an incident.
- Additive migrations remain compatible with the previous release.
- Pause problematic queues or beat schedules if side effects are involved.
- Restore data only for confirmed data corruption/loss, not ordinary code
  rollback.
- Record the incident timeline and idempotency/replay decision for queued tasks.

## Database operations

- Application roles are not database superusers.
- Migration role may have additional DDL permission and is used only by the
  release job.
- Connections have timeouts and pooling appropriate to database capacity.
- Long queries, lock waits, replica lag, deadlocks, connection saturation, and
  storage growth alert.
- Index creation on large tables uses an online/concurrent strategy where
  supported.
- Production data changes use reviewed management commands or migrations, not
  ad hoc admin shell edits.

## Celery operations

- Tasks are idempotent and receive entity IDs, not serialized secrets or large
  documents.
- Queue time, runtime, attempts, and final outcome are logged.
- Retries use bounded exponential backoff with jitter.
- Hard/soft time limits prevent stuck tasks.
- Poison tasks reach a failure/dead-letter workflow and alert.
- A task scheduled from a database transaction is queued with
  `transaction.on_commit()`.
- Worker shutdown allows in-flight task policy to complete or safely redeliver.

## Object-storage operations

- Buckets are private by default.
- Enable encryption, versioning, lifecycle, access logging, and least-privilege
  service credentials.
- Presigned browser upload capability is restricted to one random
  `staging/uploads/` key. Only the worker/service identity can write immutable
  `media/` and generated `exports/` prefixes.
- Purge all current/noncurrent versions and delete markers under
  `staging/uploads/` after two days as a defense-in-depth lifecycle rule;
  monitor that the rule remains enabled.
- Upload, derivative, export, and backup prefixes have independent lifecycle
  rules.
- CDN origin access cannot list the bucket.
- Inventory/reconciliation alerts on unknown or missing objects before cleanup.
- Credential rotation is tested without downtime.

Local MinIO bootstrap creates a scoped `neb-media-service` user/policy and the
two-day staging lifecycle rule. Verify them after bootstrap:

```bash
docker compose run --rm minio-init
docker compose run --rm --entrypoint /bin/sh minio-init -ceu \
  'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD";
   mc admin policy info local neb-media-service;
   mc ilm rule ls "local/$S3_BUCKET" --expiry'
```

Production uses provider IAM rather than copying local credentials. Separate
upload-signing/web and processing identities further when the deployment
supports it; neither receives bucket-administration permission.

## Email operations

- Verification, reset, and critical-security mail uses a transactional provider.
- Configure SPF, DKIM, and DMARC for the sending domain.
- Track delivery/bounce/complaint outcomes without logging message secrets.
- Resending uses a deduplication window.
- Product email is opt-in/configurable; required security email is separate.

## Staff administration

- Rate-limit `/admin/login/` at ingress and return `429` for exhausted limits.
- Set `NGINX_ADMIN_ALLOW_CIDR` to the staff VPN/IAP egress network; the local
  `all` value must never reach a public deployment.
- Prefer organization SSO with phishing-resistant MFA at the ingress/identity
  layer; the first product release does not expose social OAuth to users.
- Review staff accounts and permissions quarterly and audit every moderation
  action.

## Observability and alerts

Django emits one structured completion record per request with request ID,
method, path (without query string), resolved route, status, duration, service,
environment, and release. Celery emits explicit retry/failure records with task
name, ID, attempt/outcome, and exception type. Set `APP_RELEASE` to the exact
image/git release and use a distinct `SERVICE_NAME` for web, worker, and Beat.
Sentry receives the same environment/release metadata when configured and does
not collect default PII.

Minimum dashboards:

- HTTP request rate, latency percentiles, 4xx/5xx by route;
- PostgreSQL connections, CPU/storage, slow queries, locks;
- Redis memory/eviction/connectivity;
- Celery queue depth/oldest task/failure/retry/runtime;
- registration/login/reset throttle and failure rates;
- upload rejection/processing duration/orphan count;
- email send/failure/bounce;
- catalog/feed generation latency;
- backup age and restore-drill status.

Page on user-impacting availability, sustained error rate, database capacity,
oldest critical task, failed backup, or security anomaly. Ticket non-urgent
growth and individual malformed user requests.

External smoke-flow definitions and the exact proxy/HSTS contract are in the
[production deployment baseline](production-deployment.md).

## Incident handling

1. Assign incident lead and open an internal timeline.
2. Identify affected environment, release, users/data, and security impact.
3. Preserve relevant redacted logs/audit evidence.
4. Mitigate with rollback, feature disablement, queue pause, credential
   rotation, or access restriction.
5. Validate recovery through synthetic and user-visible paths.
6. Communicate according to severity/privacy obligations.
7. Produce a blameless review with concrete owners and regression tests.

Never paste credentials, cookies, signed URLs, private bingo documents, or raw
personal exports into tickets/chat.

## Maintenance

- Dependency and base-image updates: at least monthly and immediately for
  relevant critical advisories.
- Restore drill: quarterly and after material backup changes.
- Access review: quarterly.
- Secret rotation: provider/policy schedule and after suspected exposure.
- Database index/query review: before large launches and as traffic changes.
- Retention/orphan reconciliation: scheduled and monitored.
- Raw interaction-event cleanup: daily; default retention is 90 days through
  `ANALYTICS_RAW_EVENT_RETENTION_DAYS` (minimum seven days for Trending).
- Relational counter reconciliation: daily in bounded batches. Operators can
  inspect drift with `python manage.py reconcile_counters --dry-run` and repair
  it with `python manage.py reconcile_counters`. This intentionally excludes
  lifetime view/play totals, which cannot be rebuilt after raw-event expiry.
- Privacy deletion/export sampling: regularly in staging with synthetic users.
