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
  non-deployable `.invalid` origin only to check build integrity.

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

Do not expose the origin around the controlled edge. If a platform omits this
Nginx layer, reproduce the same strip/normalize contract at its trusted ingress
and set Django's hop count only after verifying the exact chain.

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

## Immutable release and migrations

Build each production image once, scan it, record its digest and SBOM, and
promote that exact digest. Both production images declare non-root users. Do
not inject `.env` files or build contexts containing secrets.

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
