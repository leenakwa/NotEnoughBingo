# Not Enough Bingo

Production-oriented social platform for creating, publishing, playing, and
sharing user-authored bingo boards.

## Stack and layout

- `frontend/` — Next.js, TypeScript, App Router
- `backend/` — Django, Django REST Framework, Celery
- `infra/` — Nginx, storage policies, backup scripts
- `docs/` — architecture, domain, security, and operations documentation
- PostgreSQL, Redis, and S3-compatible storage (SeaweedFS for new local checkouts)

Django owns business rules and authorization, Next.js owns the UI, and Nginx
provides one browser origin for both applications.

## Requirements

- Docker Engine with Docker Compose v2
- GNU Make (optional)
- Node.js 22 only when running live Playwright tests from the host

No local Python, PostgreSQL, Redis, or S3 server installation is required.
Backend/worker images include Pango and Noto fonts for multilingual PNG/PDF
exports. Python-only development/test runners need `pango1.0-tools`,
`fonts-noto-core`, `fonts-noto-cjk`, and `fonts-noto-color-emoji` installed;
the backend CI job installs them explicitly.

## Start locally

```bash
cp .env.example .env
docker compose config --quiet
docker compose build
docker compose up -d --wait postgres redis minio mailpit
docker compose run --rm --no-deps minio-init
docker compose run --rm --no-deps backend python manage.py migrate --noinput
docker compose up -d --wait backend worker beat frontend proxy
docker compose exec backend python manage.py seed_dev
```

Seed login: `alex@example.test` / `LocalDevPassword!123`.

Local services:

- App: <http://localhost:8080>
- API docs: <http://localhost:8080/api/v1/docs/>
- API schema: <http://localhost:8080/api/v1/schema/>
- Django Admin: <http://localhost:8080/admin/>
- Mailpit: <http://localhost:8025>
- Local S3 endpoint: <http://localhost:9000>

Fresh `.env` files select `compose.s3-emulator.yml`. Existing `.env` files
without `COMPOSE_FILE` keep their MinIO container and `minio_data` volume;
the emulator uses a separate `seaweedfs_data` volume. If you have local media
to retain, copy it through the S3 API before selecting the emulator. The
withdrawn MinIO Community images cannot be pulled on a fresh machine.

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
npx playwright install chromium webkit
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
production container images. Release image jobs assert a non-root runtime,
fail on fixable high/critical vulnerabilities, and publish SPDX SBOM artifacts;
repository history is scanned for secrets.

Backend production and development dependency graphs are locked for Python
3.13 in `backend/requirements.lock` and `backend/requirements-dev.lock`. After
changing `backend/pyproject.toml`, regenerate both with `uv` and commit the
resulting files:

```bash
uv pip compile --universal --python-version 3.13 backend/pyproject.toml -o backend/requirements.lock
uv pip compile --universal --python-version 3.13 --extra dev backend/pyproject.toml -o backend/requirements-dev.lock
```

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
- [Production deployment baseline](docs/operations/production-deployment.md)
- [Backup and restore](docs/operations/backups.md)

`compose.yml` is the reproducible development topology. Production should use
immutable images, managed stateful services where available, private object
storage, separate web/worker/beat processes, and a managed ingress.
