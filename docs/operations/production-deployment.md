# Production deployment baseline

This is the minimum supported public-beta topology. It keeps the modular
monolith and does not require Kubernetes:

```text
Internet HTTPS
  -> DNS / CDN / WAF / TLS load balancer
  -> private HTTP Nginx origin
  -> Next.js and Django web replicas
  -> managed PostgreSQL, managed Redis, private S3-compatible storage
  -> transactional email provider
  -> Celery workers and exactly one Celery Beat
```

Only the CDN/load balancer is public. Django, Next.js, PostgreSQL, Redis,
workers, Beat, and object-storage control endpoints stay on private networks.

## Required configuration

Start from `.env.example` only as a variable inventory; none of its local
credentials may be reused. `config.settings.production` fails during startup
for debug mode, known local/default credentials, wildcard hosts, SQLite,
local S3 emulator/Mailpit, insecure public URLs, non-TLS SMTP, insecure cookies,
missing shared cache, disabled HTTPS redirect/HSTS, or an absent trusted proxy
hop. Run this before a rollout:

```bash
DJANGO_SETTINGS_MODULE=config.settings.production python manage.py check --deploy
```

Provide secrets from a secret manager and configure at least:

- a unique `DJANGO_SECRET_KEY`, explicit `ALLOWED_HOSTS`, HTTPS
  `CSRF_TRUSTED_ORIGINS`, and `FRONTEND_URL`;
- managed `DATABASE_URL`, `REDIS_URL`, Celery broker/result URLs, and a shared
  Redis cache backend;
- direct/session-pooled PostgreSQL connections for Celery maintenance workers;
  their advisory overlap locks do not work through transaction pooling;
- private S3 credentials, bucket, region, endpoint, and HTTPS browser endpoint
  when a private signing endpoint is set;
- transactional SMTP host/credentials with TLS, verified
  `DEFAULT_FROM_EMAIL`, SPF, DKIM, DMARC, bounce and complaint monitoring;
- `APP_ENVIRONMENT`, immutable `APP_RELEASE`, service-specific `SERVICE_NAME`,
  `SENTRY_DSN`, and an intentional trace sample rate;
- `ANALYTICS_RAW_EVENT_RETENTION_DAYS` (90 by default, never below the
  seven-day Trending window) with the scheduled cleanup task enabled;
- a monitored `NEXT_PUBLIC_SUPPORT_EMAIL`. It is public and is embedded when
  the frontend image is built. The production Dockerfile rejects a missing or
  malformed address; the operator must verify that the inbox receives mail.
- the exact public HTTPS origin as `NEXT_PUBLIC_APP_URL` when building the
  frontend image. The production Dockerfile rejects a missing or non-HTTPS
  value. Rebuild the image if the public origin changes; the CI image uses a
  non-deployable `.invalid` origin only to check build integrity. At startup,
  the image compares its embedded build origin with the runtime value and
  rejects CI/test origins when `APP_ENVIRONMENT=production`.
- the full lowercase Git commit SHA of the actual built frontend source as
  `NEXT_PUBLIC_APP_RELEASE` at image build and runtime. The image rejects a
  missing/malformed identity or a runtime override that differs from its build.
  Browser diagnostics send this embedded public SHA in an optional header,
  preserving the existing report body for older backends. Events use
  `frontend-<sha>` even when an older tab reports to a newer backend; legacy
  clients without a valid identity use `frontend-unknown`. This is diagnostic
  metadata supplied by the client, not a trusted attestation.
- `APP_ENVIRONMENT=production` on the public frontend at runtime. The
  production image defaults to `staging`: preview pages then emit
  `noindex, nofollow`, `robots.txt` disallows crawling, and the sitemap is
  empty. Set the value only when the canonical public origin is ready; verify
  the indexed response and sitemap during the deployment smoke check.

The frontend CSP has no blanket `https:` source in production. Set the
comma-separated `CSP_IMAGE_ORIGINS`, `CSP_CONNECT_ORIGINS`, and
`CSP_MEDIA_ORIGINS` to the exact HTTPS origins used by the media/CDN, browser
upload endpoint, and telemetry provider. Values are origins, not URL paths.

The Nginx authentication request burst is `5` by default. `NGINX_AUTH_BURST`
is raised only in the isolated browser-test stack because its synthetic users
share one source IP. Keep the production value at its default unless real
traffic data justifies a separately reviewed change. Django also applies
independent request and confirmation limits to email changes.

The general anonymous API limit remains `120/min` by default. The read-only
`/auth/session/` endpoint uses a separate `300/min` scope so public page
navigation does not consume the general anonymous allowance. The live-browser
CI job sets `ANON_RATE_LIMIT=600/m` only for its many synthetic users sharing
one source IP; determine production limits from real traffic and abuse data.

## Retained frontend assets

Before promoting a frontend, export its public Next.js static files from the
trusted immutable image. Keep assets from the active release and rollback
releases available at the same origin while their tabs may still be open.
Next.js detects build changes and can reload a document, but this does not keep
an old tab's CSS or JavaScript URLs available by itself.

Resolve the image from the approved registry artifact to a full image ID or
`repository@sha256:...` digest. Use its full Git release and an explicit archive
budget; these values below must be supplied by the release operator:

```bash
python3 infra/scripts/retain-frontend-assets.py \
  --image "$FRONTEND_IMAGE_DIGEST" --release "$FRONTEND_RELEASE" \
  --asset-dir "$FRONTEND_ASSET_DIR" --max-bytes "$FRONTEND_ASSET_BUDGET_BYTES"
```

The command uses Docker to inspect and copy files from a stopped container; it
does not run the image entrypoint. It checks the image revision label, embedded
release and runtime declaration for consistency. These checks are metadata
consistency checks; trusted registry provenance and approved source remain
separate release requirements.

Use an absolute canonical host directory owned by the sole publishing account,
with no symlink ancestors. An empty directory is initialized with an ownership
marker; an unowned nonempty directory is rejected. Public assets are placed in
`public/_next/static`; private inventories and the publication lock stay outside
the public root. The archive is append-only. Conflicting bytes at an existing
URL, unsafe paths, source maps, special files, budget exhaustion or insufficient
free space stop publication. An interrupted run may leave complete additional
files; rerunning the same image is safe. Promotion requires exit status zero.

Mount the same published archive read-only at `/srv/frontend-assets` on every
Nginx replica. The repository Nginx template serves successful retained files
with immutable cache headers and falls back to the current Next.js process for
files absent from the archive. Missing-file and private-inventory responses
must remain errors without immutable caching. For a local rehearsal, the
`compose.frontend-assets.yml` overlay adds this read-only bind to the base
Compose proxy and requires `FRONTEND_ASSET_DIR`; it is not a production topology.
The production ingress must reproduce that mount or an equivalent public static
store without mounting application source.

Publish before changing frontend traffic, verify representative old and new
asset hashes through every origin replica and the actual CDN, and repeat the
checks after rollback. Keep both generations during rollback. The operator must
choose the supported tab age, rollback window, storage budget, replication
process and CDN negative-cache policy. This utility never prunes automatically:
monitor storage and stop promotion at its configured budget. Any later pruning
must explicitly preserve all releases still within the supported windows.

The [local rehearsal](artifacts/frontend-assets-rehearsal-2026-10-08.json)
verified all 50 assets from two immutable images before promotion, afterward
and after rollback, including gzip, cache/security headers, empty-archive
fallback and error paths. The [mixed-frontend rehearsal](artifacts/mixed-frontend-rehearsal-2026-10-08.json)
verified one same-origin stale editor journey. Actual CDN replication and the
chosen retention windows still require target evidence.

## Trusted proxy and HTTPS contract

The supported chain is a controlled TLS edge followed by this repository's
Nginx and then the applications:

1. The public edge redirects HTTP to HTTPS and strips untrusted forwarding
   headers before adding its client chain.
2. The Nginx origin accepts traffic only from that edge. Set
   `NGINX_TRUSTED_PROXY_CIDR` to its exact private source CIDR.
3. Nginx Real-IP chooses the last non-trusted address, uses it for rate limits,
   and overwrites upstream `X-Forwarded-For` with that single address.
4. Set `NGINX_FORWARDED_PROTO=https`; Nginx deliberately ignores arbitrary
   inbound `X-Forwarded-Proto`.
5. Django receives one normalized Nginx hop, so keep `TRUSTED_PROXY_HOPS=1`.
6. Set the server-only `SSR_TRUST_PROXY_CLIENT_IP=true` on private Next.js
   replicas. Next forwards Nginx's single validated client IP to Django for SSR
   reads and anonymous sitemap requests, preserving each visitor's quota rather
   than aggregating all visitors under a frontend replica. Compose enables this
   for its private application topology. Outside that topology the flag defaults
   off; do not enable it on directly exposed Next.js. IP syntax validation does
   not authenticate the sender. Sitemap lookups never forward a user's cookies.

Do not expose the origin around the controlled edge. If a platform omits this
Nginx layer, reproduce the same strip/normalize contract at its trusted ingress
and set Django's hop count only after verifying the exact chain.

Before enabling forwarding at the target, test both IPv4 and IPv6 ingress, prove
that applications cannot be reached around Nginx, and send forged forwarding
headers through the public edge. Verify that Nginx replaces them and that browser
and SSR requests for the same visitor share the expected quota. Local unit tests
establish identity handling, not target network isolation.

Set `NGINX_ADMIN_ALLOW_CIDR` to the staff VPN or identity-aware proxy egress
network. Also require SSO with phishing-resistant MFA at that external access
layer. The local value `all` is for loopback-bound development only.

## HSTS rollout

HSTS is intentionally staged. It cannot repair a broken TLS deployment and can
make a domain inaccessible for the configured lifetime.

1. Verify redirects, forwarded scheme, certificates, renewals, and every
   required subdomain with HSTS disabled.
2. Set Django and Nginx HSTS seconds to `300` and observe.
3. Increase to a day, then a week, then up to one year after successful
   operations and rollback drills.
4. Enable `SECURE_HSTS_INCLUDE_SUBDOMAINS` only after every subdomain is HTTPS.
5. Enable `SECURE_HSTS_PRELOAD` only with explicit domain-owner approval,
   `includeSubDomains`, and at least a one-year max age. Repository settings do
   not opt into browser preload lists automatically.

## Reproducible database QA before release

Use the isolated development Compose project for these drills. The schema
script is read-only and prints metadata, never connection settings or rows.
The scale script requires development settings, an explicit opt-in and
database-creation privileges. It switches to and verifies its own disposable
database, then removes it on exit. Its disabled accounts and synthetic boards
are never seeded into the QA source or a production database.

```bash
QA_PROJECT=nebqa
docker compose -p "$QA_PROJECT" exec -T backend python manage.py shell \
  < infra/scripts/audit-database-schema.py
docker compose -p "$QA_PROJECT" exec -T -e NEB_QA_SCALE_ALLOWED=1 \
  backend python manage.py shell < infra/scripts/audit-database-scale.py
```

The scaled baseline is 10,000 boards, 20,000 revisions and 180,000 cells.
It tests the old bingo schema upgrade and records base SQL query plans.
It does not model live writer contention, API/network latency or the target
provider's locking/backup limits. Keep target migration lock/runtime and
recovery measurements in the deployment rehearsal.

## Immutable release and migrations

Build each production image once, scan it, record its digest and SBOM, and
promote that exact digest. Both production images declare non-root users. Do
not inject `.env` files or build contexts containing secrets.

Release builds must pull the current base image and refresh the production
stage's OS-package installation instead of reusing an old package layer. CI
uses `pull: true` and `no-cache-filters: production`; a manual Buildx release
build must use `--pull --no-cache-filter production` before scanning. The
backend updates installed base packages from the configured Debian repositories
before adding its runtime libraries.

Browser source maps are private for this release: they can expose original
source and internal paths, so do not serve them or upload them to a public URL.
No monitoring-provider map upload is configured or required for launch. The CI
image job rejects maps and sensitive file types in the frontend's public
directories; repeat the HTTP check on the deployed domain. Use the release
commit and server-side error logs for debugging until a private monitoring
upload is configured and reviewed.

Run migrations once as a dedicated release job, never as a web/worker startup
side effect:

```bash
docker run --rm <backend-image-digest> python manage.py migrate --noinput
```

`RUN_MIGRATIONS=1` is rejected by the image entrypoint to prevent accidental
concurrent migration from replicated processes. Prefer additive,
backwards-compatible migrations; deploy compatible processes after the release
job succeeds. Rollback changes image digests, not destructive schema changes.

The scalable sitemap release must deploy the backend first: its new
`/api/v1/sitemap/bingos/index/` endpoint and `?part=<integer>` projection must be
available before the new frontend. The new backend retains the legacy unpaged
endpoint for an older frontend. A new frontend with an older backend deliberately
returns sitemap 503 with `Retry-After: 300`; do not treat an empty or partial XML
catalog as a successful rollout. Smoke-check the index and every child URL,
confirm canonical origins and private/deleted-board exclusion, then promote the
frontend. Record real catalog size, SQL latency and crawl capacity in the target
rehearsal.

The author draft and revision list endpoints now return paginated envelopes
(`count`, `next`, `previous`, `results`) instead of arrays. No repository
frontend consumer was found, but this does not establish compatibility with
external clients. Before release, inventory such consumers and migrate any
array-dependent client; retain this as a release constraint until the actual
consumer inventory is known.

Run the anonymous read-only walker against the selected public HTTPS origin:
`python3 infra/scripts/verify-sitemap.py "$PUBLIC_ORIGIN"`. It follows the complete
index without authentication or redirects, verifies static/canonical parts,
no-store and XML limits, and delays child requests by 0.6 seconds by default.
Record its result and separately prove public/private catalog coverage; a small
XML walk does not establish crawl capacity or concurrent-load limits.

Password reset/change stores security-email delivery intent with the SQL audit
event and freezes the intended recipient. Broker publication happens after
commit; failure does not undo a successful credential change. The worker retries
pending intents and Beat scans up to 25 due intents every five minutes. Failed
delivery backs off from two minutes to one hour. Configure
`EMAIL_TIMEOUT_SECONDS` (10 seconds by default), verify the scanner with the real
broker and SMTP provider, and alert on overdue pending delivery. SMTP acceptance
can precede a failed database acknowledgement; delivery is at least once and a
duplicate security notice is possible after that failure. Other account emails
also have durable verification/event delivery state; local checks and the actual
provider rehearsal are recorded separately.

For this additive account-email migration, deploy in this order:

1. Apply `accounts.0006_emailverification_delivery`. Its persistent empty JSON
   SQL default permits older web processes to insert legacy rows. Existing
   hash-only links stay valid; a historically lost legacy raw token requires
   normal resend because it cannot be reconstructed.
2. Drain and replace old workers, then verify the new ID-only verification and
   security-notice tasks are registered. New workers retain the old raw-token
   task signature for already queued jobs; old workers cannot handle new task
   names. Enable the new recovery schedule only with compatible workers.
3. Roll out the new web producers, then the compatible frontend. Verify actual
   registration, verification, both email-change notices, deletion cancellation
   and account export through the target broker/provider.

For rollback, restore the prior compatible frontend before prior web while
keeping migration 0006 and the compatible new workers. New workers consume both
legacy raw-token and new ID-only account mail jobs. Old workers cannot consume
the new task names; do not roll workers back while new producers, recovery
schedules or those queued messages remain. Any required worker rollback needs
an explicit producer/schedule pause and queue reconciliation plan. Local checks
against a synthetic prior Git release do not prove the actual target image,
configuration or broker retention; rehearse those exact artifacts before launch.

New verification links are reconstructed from a versioned HMAC over immutable
request fields; the database stores their digest and delivery state, not their
bearer token. During `DJANGO_SECRET_KEY` rotation, provide previous strong keys
as the comma-separated `DJANGO_SECRET_KEY_FALLBACKS` on web, worker and Beat.
Retain them through the verification lifetime and pending recovery window;
without a matching key a pending delivery remains pending with backoff, and its
digest/expiry is not silently changed. Production startup rejects short/local
fallback keys without logging their values. Keep fallback secrets in the secret
manager. Remove obsolete keys after confirming no valid pending links need them.

Non-password recovery scans up to 10 verification rows and 10 security events
every five minutes; an email-change event can deliver two independent notices.
Recipients are frozen per intent, and cancelling deletion cancels its warning
intent in the same transaction. Verify overdue-delivery alerts at the target;
at-least-once SMTP acknowledgement semantics also apply to these notices.

Account and bingo export publication preserves the committed HTTP 202/job ID
through recoverable broker failure. Their existing recovery sweep separates
five-minute pending eligibility from processing hard-limit expiry and continues
after individual publication failures; see the runbook for attempt bounds.

## Release evidence

The release commit must pass the CI jobs for backend/frontend quality,
migrations/OpenAPI, browser and live full-stack flows, dependency audits,
Compose/Nginx syntax, complete-history Gitleaks scanning, production image
builds, non-root assertions, Trivy high/critical scans, and per-image SPDX SBOM
artifacts. Configure branch protection to require the canonical `Release gate`
status, which fails unless every one of those jobs succeeds for the exact
commit. Artifact-registry signing/attestation remains a deployment-platform
control.

## Post-deploy synthetic checks

Run the prepared read-only smoke against the canonical HTTPS origin and a
known published board ID. It validates DNS/TLS through ordinary `curl`, public
routes, readiness, guest session status, redirects, and representative private
file paths without using an account:

```bash
PUBLIC_BASE_URL=https://<actual-domain> \
PUBLIC_BINGO_ID=<published-bingo-uuid> \
infra/scripts/smoke-public.sh
```

The same script can be rehearsed against an isolated local stack by setting
`ALLOW_LOCAL_HTTP=1` and a localhost URL. It does not replace live email,
storage, authenticated writes, monitoring, or rollback checks below.

Run a low-frequency external monitor from outside the origin network:

- read-only: `/`, Discover, one public bingo, and one cell interaction;
- write with a dedicated synthetic account: login and save progress, with an
  occasional immutable share-result check;
- staging only: register, receive and follow verification mail, then login;
- infrastructure: `/healthz`, `/api/health`, `/api/v1/health/live/`,
  `/api/v1/health/ready/`, and `/api/v1/health/beat/`.

Do not repeatedly register production users or send production email as a
health probe. Alert on sustained user-flow failures, not one transient sample.

## External launch checklist

The repository cannot configure DNS, certificates, CDN/WAF rules, secret
manager, managed databases, Redis, bucket encryption/versioning/IAM, email
domain records, Sentry project, staff access gateway, backup provider, or
off-site synthetic monitor. Configure and verify those before routing public
traffic. Follow [the operations runbook](runbook.md) and
[backup/restore procedure](backups.md), including an isolated restore drill.
