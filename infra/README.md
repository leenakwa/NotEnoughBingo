# Infrastructure

`compose.yml` defines the local development topology. Fresh checkouts also
load `compose.s3-emulator.yml` through `.env.example`:

- `frontend`: Next.js development server;
- `backend`: Django development server;
- `worker`: Celery worker;
- `beat`: Celery beat scheduler;
- `postgres`: application database;
- `redis`: cache and Celery transport;
- `minio`: local S3-compatible storage (SeaweedFS in the fresh-install override);
- `minio-init`: MinIO bootstrap on legacy local stacks; the SeaweedFS override
  creates its bucket at startup and makes this service a no-op;
- `mailpit`: local SMTP capture;
- `proxy`: same-origin Nginx entrypoint.

Only the proxy, developer database/cache ports, S3 emulator, and Mailpit are bound to
loopback. Frontend/backend communicate on the private Compose network.

The application Dockerfiles must expose matching `development` and
`production` stages:

```text
frontend/Dockerfile  -> development :3000, production :3000
backend/Dockerfile   -> development :8000, production :8000
```

Production uses immutable images built from the production stages. The local
bind mounts and development servers in `compose.yml` are not production
settings.

Fresh local installs and CI use the maintained SeaweedFS 4.47 S3 emulator.
The withdrawn MinIO Community images remain in the base Compose file solely
for existing local stacks with cached images and data. Their `minio_data`
volume is never mounted into SeaweedFS; migrating existing objects requires
an explicit S3 copy. Neither local emulator is the production object store.
Production must use a maintained provider with private, versioned storage,
least-privilege credentials, lifecycle rules, and a CORS policy for the real
web origin. The local SeaweedFS identity and automatic bucket are for
development only; they do not demonstrate those production controls.

## Proxy

Nginx:

- provides `/healthz`;
- routes `/api/`, `/admin/`, and `/static/` to Django;
- routes everything else to Next.js;
- forwards correlation and proxy headers;
- accepts forwarded client identity only from an explicit trusted ingress CIDR,
  then normalizes it before application forwarding and rate limiting;
- asserts an explicit browser-facing scheme so external TLS termination cannot
  create Django HTTPS redirect loops;
- applies baseline security headers;
- rate limits sensitive auth endpoints and general API bursts;
- sets a configurable request-body ceiling.

Application-level throttles and permissions remain authoritative.

In a legacy MinIO stack, `minio-init` creates a non-root application identity limited to
`staging/uploads/`, `media/`, and `exports/`, then installs a two-day purge rule
for every version and delete marker under the staging prefix. Browser uploads
are presigned for one staging key; only backend/worker credentials can write
final prefixes.

The local topology has exactly one trusted application proxy hop, so
`TRUSTED_PROXY_HOPS=1`. Production keeps that value when using this Nginx:
`NGINX_TRUSTED_PROXY_CIDR` identifies the controlled CDN/LB network, Real-IP
resolves the client, and Nginx overwrites the upstream chain with one address.
Set `NGINX_FORWARDED_PROTO=https`, firewall the origin to the controlled edge,
and set `NGINX_ADMIN_ALLOW_CIDR` to the staff VPN/IAP egress network. Do not
trust user-supplied forwarding headers or expose the origin directly.

See the [production deployment baseline](../docs/operations/production-deployment.md)
for the full topology, CSP/HSTS rollout, release job, and external checklist.

## Scripts

- `scripts/backup-postgres.sh`: local custom-format dump with checksum.
- `scripts/restore-postgres.sh`: guarded destructive local restore.

See [backup documentation](../docs/operations/backups.md) before using restore.

## Production requirements

- managed or HA PostgreSQL with point-in-time recovery;
- authenticated/encrypted Redis;
- private versioned object storage;
- external secret manager;
- TLS load balancer/ingress;
- non-root immutable images pinned by digest;
- centralized logs, metrics, tracing/error tracking;
- independent web/worker/beat scaling;
- controlled migration job;
- tested backup and restore.
