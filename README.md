# Not Enough Bingo

Not Enough Bingo is a social platform for creating, publishing, completing, and
sharing user-authored bingo boards. The repository is being migrated from a
static frontend prototype to a production-oriented Next.js and Django
monorepo.

The original static prototype has been fully migrated. Its historical behavior
and product decisions remain documented in `docs/audit.md`; production code and
content now come only from `frontend/`, `backend/`, and the API/database.

## Stack

- Next.js, TypeScript, and the App Router
- Django, Django REST Framework, and PostgreSQL
- Redis and Celery
- S3-compatible object storage (MinIO locally)
- Nginx as the local same-origin reverse proxy
- Pytest, frontend component tests, and Playwright

The architecture is a modular monolith. Django owns business rules and
authorization; Next.js owns rendering and interaction; Celery handles email,
media processing, exports, and retention jobs.

## Prerequisites

- Docker Engine with Docker Compose v2
- GNU Make (optional; every target expands to a documented Docker command)

No local Node.js, Python, PostgreSQL, Redis, or MinIO installation is required
for the standard development workflow.

## Quick start

```bash
cp .env.example .env
docker compose config --quiet
docker compose build
docker compose run --rm backend python manage.py migrate
docker compose up -d
docker compose exec backend python manage.py seed_dev
```

Open:

- Application: <http://localhost:8080>
- API schema: <http://localhost:8080/api/v1/schema/>
- API documentation: <http://localhost:8080/api/v1/docs/>
- Django Admin: <http://localhost:8080/admin/>
- Mailpit: <http://localhost:8025>
- MinIO console: <http://localhost:9001>

The seed command is for local development only and must refuse to run under
production settings.

## Common commands

```bash
make help
make up
make migrate
make test
make lint
make logs
make down
```

Create a local database backup:

```bash
make backup-db
```

Restore is deliberately guarded and requires an explicit confirmation:

```bash
CONFIRM_RESTORE=not-enough-bingo-local \
  make restore-db FILE=backups/postgres/example.dump
```

## Documentation

- [Repository audit](docs/audit.md)
- [Target architecture](docs/architecture.md)
- [Domain model](docs/domain-model.md)
- [User flows](docs/user-flows.md)
- [API boundaries](docs/api-boundaries.md)
- [Security and media handling](docs/security-media.md)
- [Migration plan](docs/migration-plan.md)
- [Implementation status](docs/implementation-status.md)
- [Operations runbook](docs/operations/runbook.md)
- [Backup and restore](docs/operations/backups.md)

## Environment configuration

`.env.example` documents every local setting. Production secrets must come
from the deployment platform's secret manager and must never be baked into an
image, committed to Git, or logged. At minimum, production must replace:

- `DJANGO_SECRET_KEY`
- database credentials and `DATABASE_URL`
- Redis/Celery credentials
- object-storage credentials
- email credentials
- error-tracking DSN

Production also requires HTTPS-only cookies, HSTS, an explicit allowed-host
list, real trusted origins, the exact trusted-proxy hop count, private storage
buckets with scoped IAM/lifecycle policy, image tags pinned to immutable
digests, and tested backups.

## Test commands

```bash
make test-backend
make test-frontend
make test-e2e
make test
```

The full live product-flow suite runs against the already started Compose
stack and uses host Playwright (Node.js 22 is required for this one command):

```bash
npm --prefix frontend ci
npm --prefix frontend exec -- playwright install chromium
make test-e2e-live
```

Regenerate the API schema/client contract after backend endpoint changes:

```bash
make openapi
make api-types
```

CI additionally validates formatting, type safety, migrations, the OpenAPI
schema, production dependency audits, shell scripts, infrastructure JSON/Nginx
configuration, the Compose model, and both production container stages without
publishing them.

## Deployment note

`compose.yml` is the reproducible local-development topology, not a production
orchestrator. Production should deploy immutable frontend/backend images,
managed PostgreSQL and Redis where available, private S3-compatible storage,
separate web/worker/beat processes, and a managed ingress or load balancer.
See the operations documentation for release, rollback, backup, and restore
requirements.
