# Implementation status

This document records the completed migration phases and the executable
contracts that now replace the static prototype.

## Phase 0 — audit and contracts

Completed: repository/page/editor audit, product-flow inventory, target
architecture, domain model, API boundaries, security/media design, migration
plan, and operations/backup documentation.

The historical mock pages and shared test cover were removed after their useful
editor/navigation behavior had been ported.

## Phase 1 — foundation

Completed: Next.js App Router frontend; Django/DRF modular monolith; PostgreSQL,
Redis, Celery worker/beat, MinIO, Mailpit, and Nginx Compose services; health
checks; structured logging; environment validation; CI; local seed command;
production container stages; backup/restore scripts.

## Phase 2 — authentication and profiles

Completed: email/password registration with email ownership verification,
enumeration-resistant login/reset/resend flows, password change, cookie/CSRF
sessions, active-session revocation, profiles, independent privacy flags,
notification preferences, account export, delayed account deletion, and
security-event handling.

## Phase 3 — bingo domain and editor

Completed: normalized bingo/draft/revision/cell/tag/media models; optimistic
draft concurrency; immutable published revisions; archive/restore/soft-delete;
the migrated 3x3–10x10 editor with rectangular multi-selection, text styles,
cell/background images, opacity, borders, tags, visibility, mark style, upload
polling, publish, PNG export, and PDF export.

Uploaded images are validated by signature and decoder, normalized to
metadata-free WebP on a worker-owned immutable key, and protected from draft
orphan cleanup through explicit draft/media relations.

## Phase 4 — playing and sharing

Completed: public/unlisted/private direct-link rules, guest browser progress,
registered server progress with optimistic versioning, reset, checkmark/
crossout/highlight rendering, immutable non-sequential shared results, exact
revision snapshots, and read-only `/share/{bingoId}/{shareId}` pages.

## Phase 5 — social functionality

Completed: race-safe bingo likes, follows with no-self/uniqueness constraints,
root comments, one-level replies, edit/tombstone deletion, comment/reply likes,
deduplicated internal notifications, read state, preferences, and profile
collections.

## Phase 6 — discovery

Completed: public Explore search/author/tag filters and sorting; public tag
catalog; deterministic decayed Trending score; explicitly rule-based Discover;
and idempotent interaction ingestion for future recommendation work.

## Phase 7 — moderation

Completed: reports for bingos/comments/profiles, context snapshots, status
history, moderator permission gates, report queue/filtering, hide/restore,
soft-delete, suspend/unsuspend, append-only moderation actions, Django Admin,
and session revocation on suspension.

## Phase 8 — hardening

Completed: visibility/privacy regression tests, session-cache invalidation,
pre-registration takeover protection, trusted-proxy handling, upload validation
and immutable promotion, CSP/security headers, rate limits, OpenAPI validation,
generated TypeScript API contracts, responsive/accessibility review, dependency
audits, CI image builds, and documented backup/restore/retention procedures.

Authoritative executable artifacts:

- database migrations under `backend/apps/*/migrations/`;
- `backend/openapi.yaml` and generated `frontend/lib/api/schema.d.ts`;
- backend tests under `backend/tests/` and `backend/apps/*/tests/`;
- frontend component/integration tests and Playwright tests under
  `frontend/tests/`;
- `.github/workflows/ci.yml`.
