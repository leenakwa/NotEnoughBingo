.DEFAULT_GOAL := help

COMPOSE ?= docker compose
BACKEND := $(COMPOSE) exec backend
FRONTEND := $(COMPOSE) exec frontend

.PHONY: help setup config build up down restart ps logs \
	migrate migrations-check makemigrations seed superuser \
	backend-shell frontend-shell test test-backend test-frontend test-e2e \
	test-e2e-live lint format openapi api-types backup-db restore-db

help: ## Show available commands.
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target>\\n\\n"} /^[a-zA-Z0-9_.-]+:.*## / {printf "  %-20s %s\\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Create .env from the example if it does not exist.
	@test -f .env || cp .env.example .env
	@$(MAKE) config

config: ## Validate the resolved Compose configuration.
	$(COMPOSE) config --quiet

build: ## Build local application images.
	$(COMPOSE) build

up: ## Start the local stack.
	$(COMPOSE) up -d --build

down: ## Stop the local stack without deleting volumes.
	$(COMPOSE) down

restart: ## Restart application processes.
	$(COMPOSE) restart frontend backend worker beat proxy

ps: ## Show service and health status.
	$(COMPOSE) ps

logs: ## Follow application logs.
	$(COMPOSE) logs --tail=200 --follow frontend backend worker beat proxy

migrate: ## Apply database migrations.
	$(BACKEND) python manage.py migrate

migrations-check: ## Fail when model changes have no migration.
	$(BACKEND) python manage.py makemigrations --check --dry-run

makemigrations: ## Create migrations during development.
	$(BACKEND) python manage.py makemigrations

seed: ## Seed local development data.
	$(BACKEND) python manage.py seed_dev

superuser: ## Create a local Django administrator.
	$(BACKEND) python manage.py createsuperuser

backend-shell: ## Open a shell in the backend container.
	$(COMPOSE) exec backend sh

frontend-shell: ## Open a shell in the frontend container.
	$(COMPOSE) exec frontend sh

test: test-backend test-frontend ## Run backend and frontend tests.

test-backend: ## Run backend tests.
	$(COMPOSE) exec -e USE_S3=false backend pytest

test-frontend: ## Run frontend component and integration tests.
	$(FRONTEND) npm test

test-e2e: ## Run Playwright end-to-end tests.
	$(FRONTEND) npm run test:e2e

test-e2e-live: ## Run live Playwright product flows against an already running local stack (host Node required).
	cd frontend && E2E_LIVE=1 PLAYWRIGHT_BASE_URL=http://localhost:8080 MAILPIT_BASE_URL=http://localhost:8025 npm run test:e2e -- --project=live-chromium

lint: ## Run backend and frontend static checks.
	$(BACKEND) ruff check .
	$(BACKEND) mypy .
	$(FRONTEND) npm run lint
	$(FRONTEND) npm run typecheck

format: ## Format backend and frontend source.
	$(BACKEND) ruff format .
	$(FRONTEND) npm run format:write

openapi: ## Validate and export the OpenAPI document.
	$(BACKEND) python manage.py spectacular --validate --file openapi.yaml

api-types: ## Regenerate the checked-in frontend client types from OpenAPI.
	$(FRONTEND) npm run api:types

backup-db: ## Create a local PostgreSQL custom-format backup.
	bash infra/scripts/backup-postgres.sh

restore-db: ## Restore FILE into local PostgreSQL; requires CONFIRM_RESTORE.
	@test -n "$(FILE)" || (echo "Usage: CONFIRM_RESTORE=not-enough-bingo-local make restore-db FILE=backups/postgres/file.dump" >&2; exit 2)
	bash infra/scripts/restore-postgres.sh "$(FILE)"
