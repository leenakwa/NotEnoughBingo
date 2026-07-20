# Not Enough Bingo

Production-oriented social platform for creating, publishing, playing, and
sharing user-authored bingo boards.

## Stack and layout

- `frontend/` — Next.js, TypeScript, App Router
- `backend/` — Django, Django REST Framework, Celery
- `infra/` — Nginx, MinIO policies, backup scripts
- `docs/` — architecture, domain, security, and operations documentation
- PostgreSQL, Redis, and S3-compatible storage (MinIO locally)

Django owns business rules and authorization, Next.js owns the UI, and Nginx
provides one browser origin for both applications.

## Requirements

- Docker Engine with Docker Compose v2
- GNU Make (optional)
- Node.js 22 only when running live Playwright tests from the host

No local Python, PostgreSQL, Redis, or MinIO installation is required.

## Start locally

```bash
cp .env.example .env
docker compose config --quiet
docker compose build
docker compose up -d --wait postgres redis minio mailpit
docker compose run --rm --no-deps minio-init
docker compose run --rm --no-deps backend python manage.py migrate --noinput
docker compose up -d --wait
docker compose exec backend python manage.py seed_dev
```

Seed login: `alex@example.test` / `LocalDevPassword!123`.

Local services:

- App: <http://localhost:8080>
- API docs: <http://localhost:8080/api/v1/docs/>
- API schema: <http://localhost:8080/api/v1/schema/>
- Django Admin: <http://localhost:8080/admin/>
- Mailpit: <http://localhost:8025>
- MinIO console: <http://localhost:9001>

Create an administrator with `make superuser`.

## Daily commands

```bash
make ps          # service and health status
make logs        # follow application logs
make migrate     # apply migrations
make seed        # restore deterministic development content
make restart     # restart application services
make down        # stop services and keep data
```

To delete all local containers and data:

```bash
docker compose down --volumes --remove-orphans
```

## Test and validate

Start the stack first, then run:

```bash
make lint              # Ruff, mypy, ESLint, TypeScript
make migrations-check  # fail on model changes without a migration
make test              # backend + frontend tests
make test-e2e          # desktop and mobile browser smoke tests
```

The live suite covers registration and email verification, authoring and
publishing, guest and authenticated play, sharing, revisions, privacy, social
actions, reports, and admin moderation:

```bash
cd frontend
npm ci
npx playwright install chromium
cd ..
make test-e2e-live
```

After changing backend endpoints, regenerate and commit both API artifacts:

```bash
make openapi
make api-types
git diff -- backend/openapi.yaml frontend/lib/api/schema.d.ts
```

GitHub Actions additionally checks dependency audits, PostgreSQL behavior,
Compose/Nginx/MinIO configuration, full-stack product flows, and both
production container images.

## Environment and data

`.env.example` is the source of truth for supported variables and safe local
defaults. Never reuse its secrets outside local development. Production must
provide real Django, database, Redis, object-storage, email, and monitoring
credentials; HTTPS-only cookies, trusted origins, allowed hosts, HSTS, and
proxy-hop settings must match the deployment.

Local database backup and guarded restore:

```bash
make backup-db
CONFIRM_RESTORE=not-enough-bingo-local \
  make restore-db FILE=backups/postgres/example.dump
```

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md)
- [Domain model](docs/domain-model.md)
- [Operations runbook](docs/operations/runbook.md)
- [Backup and restore](docs/operations/backups.md)

`compose.yml` is the reproducible development topology. Production should use
immutable images, managed stateful services where available, private object
storage, separate web/worker/beat processes, and a managed ingress.
