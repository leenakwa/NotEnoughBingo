# Target architecture

## Architectural style

Not Enough Bingo is a modular monolith with independently scaled process
types. The initial product does not need distributed business transactions or
microservice operational overhead.

- Next.js owns web rendering, navigation, accessible interaction, guest
  progress, and the generated API client.
- Django and Django REST Framework own all business rules, persistence,
  permissions, validation, moderation, and API contracts.
- PostgreSQL is the source of truth.
- Redis is disposable infrastructure for cache, throttling coordination, and
  Celery transport; it must not be the sole store for user data.
- S3-compatible object storage holds original/derived media and exports.
- Celery worker and beat processes handle work that is slow, retryable, or
  scheduled.

The browser reaches frontend and backend through one public origin. The proxy
routes `/api/`, `/admin/`, and Django static paths to the backend and all other
paths to Next.js. This keeps cookies and CSRF behavior predictable and avoids a
needlessly broad CORS policy.

## Runtime topology

```text
                         ┌─────────────────┐
Browser ── HTTPS ───────▶│ ingress / proxy │
                         └───────┬─────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │                           │
             Next.js :3000              Django :8000
                   │                           │
                   │ typed /api/v1 client     ├──────── PostgreSQL
                   │                           ├──────── Redis
                   │                           └──────── S3 storage
                   │
                   └──────────────── server-side API calls

                 Celery worker/beat ─── PostgreSQL / Redis / S3 / Email
```

Local development adds MinIO and Mailpit. Production should prefer managed
PostgreSQL, Redis, object storage, mail delivery, TLS ingress, and centralized
logs.

## Backend modules

| Module | Responsibility |
| --- | --- |
| `accounts` | User identity, verification, password workflows, sessions, export/deletion |
| `profiles` | Public profile, privacy settings, follows |
| `bingos` | Logical bingo, drafts, revisions, cells, tags, publishing |
| `media_assets` | Upload intents, validation, metadata, derivatives, retention |
| `plays` | Registered progress and immutable shared results |
| `social` | Likes, comments, replies |
| `notifications` | In-app notification inbox and preferences |
| `feeds` | Explore, Trending, Discover, search |
| `analytics` | Append-only interaction events and aggregates |
| `moderation` | Reports, content state, suspension, audit actions |
| `exports` | PNG/PDF and personal-data export jobs |

Modules may call explicit service functions in the same process. They must not
reach into another module's private query or mutation implementation.

## Request and mutation rules

1. API views authenticate and validate the transport contract.
2. Query services build permission-scoped, optimized querysets.
3. Domain services perform multi-model business mutations inside
   `transaction.atomic()`.
4. Database constraints remain the final defense against races.
5. Side effects are queued with `transaction.on_commit()`.
6. Serializers return public identifiers only; internal primary keys never
   appear in URLs.

Important mutations use optimistic or explicit concurrency control:

- draft autosave uses a revision integer and `If-Match`;
- publish locks the logical bingo/draft row and creates one complete revision;
- likes/follows rely on unique constraints and idempotent create/delete;
- hot counters use `F()` expressions and periodic reconciliation;
- shared result creation accepts an idempotency key;
- upload completion locks the asset intent before transitioning state.

## Rendering boundaries

Use Server Components for public catalog/detail reads and authenticated pages
that do not require browser-only state. Use Client Components for:

- editor document/selection state;
- file pickers and object-URL previews;
- guest progress;
- interactive play marks;
- optimistic likes/follows/comments;
- dialogs, menus, and notification controls.

The editor should be composed from a reducer-backed document model, board,
cell, selection inspector, metadata form, upload controls, and save/publish
coordinator. It must not become one stateful page component.

## Bingo revision lifecycle

```text
new Bingo
   └── editable Draft (version N)
          └── publish transaction
                ├── immutable BingoRevision(number=1)
                ├── immutable BingoCell rows
                └── Bingo.current_revision = revision 1

edit published Bingo
   └── editable Draft based on revision 1
          └── publish transaction
                ├── immutable BingoRevision(number=2)
                └── Bingo.current_revision = revision 2

SharedResult ───────────────▶ exact BingoRevision + selected cell positions
```

Revision rows and their cells are never updated. Moderation/access envelopes
may hide content without altering the snapshot. A database deletion policy must
protect any revision referenced by a shared result.

## Media and export pipeline

Uploads use a three-step intent:

1. authenticated client requests an upload intent with purpose and metadata;
2. backend returns a short-lived, size/type-constrained presigned POST;
3. client uploads and calls finalize; the asset remains quarantined until a
   worker verifies and processes it.

Published documents reference ready `MediaAsset` records, never raw URLs or
base64. Derivatives and exports are background jobs with idempotent keys and
bounded retries. Details are in [security-media.md](security-media.md).

## Feeds

### Explore

Explore is a deterministic query over accessible public bingos with indexed
title/author/tag filters, explicit sort order, and stable pagination.

### Trending

Trending is intentionally understandable. For eligible public bingos, count
each authenticated actor or anonymous browser identifier at most once per
event type over a rolling seven-day window:

```text
weighted =
    0.05 × impressions
  + 0.25 × views
  + 0.50 × opens
  + 3.00 × likes
  - 3.00 × unlikes
  + 2.00 × starts
  + 4.00 × completions
  + 5.00 × shares
  + 3.50 × comments

score = ln(1 + max(weighted, 0)) × 0.5^(hours_since_publish / 72)
```

The per-event identity deduplication limits repeated refreshes/actions from one
actor. Catalog/feed permission scopes still exclude non-public, deleted, and
moderated content when results are served. The logarithm prevents one large
counter from dominating; the 72-hour half-life gives newer work a chance.
Weights are explicit versioned product configuration, not random values.
Aggregates refresh periodically and can be reconciled from interaction events.

### Discover

Discover is rule-based in the first release:

1. recent public work by followed authors;
2. public bingos sharing tags with recent meaningful interactions;
3. Trending and recent public fallback;

Guests receive a mix of Trending and recent content. This feed is never labeled
as machine learning.

## Caching

- Cache only responses whose permission scope is explicit in the cache key.
- Public revision documents and public tags can have long-lived cache entries.
- User-specific feeds, notification counts, and private objects must include
  user/session identity or remain uncached.
- Invalidation occurs after transaction commit.
- Cache failure degrades performance, not correctness.

## Observability

Every process emits structured JSON in production with:

- timestamp, severity, service, environment;
- request/correlation ID;
- route name, status, duration, and database query summary where appropriate;
- safe actor public ID when needed;
- Celery task name, task ID, attempt, and outcome.

Passwords, cookies, CSRF values, reset/verification tokens, storage signatures,
authorization headers, full request bodies, and unnecessary personal data are
always redacted.

Health endpoints:

- liveness: process can answer;
- readiness: required dependencies are available and migrations are compatible;
- worker: targeted Celery ping;
- beat: live PID plus scheduled-task telemetry;
- proxy: local response and upstream readiness through orchestration.

Error tracking is configured through an abstraction and DSN environment
variable. Metrics should cover request latency/error rate, queue depth/task
failures, database saturation, upload rejection, notification fan-out, and
authentication throttles.

## Availability and deployment

- Web and worker processes are stateless and horizontally scalable.
- Only one beat scheduler is active unless the scheduler supports leader
  election.
- Migrations follow expand/migrate/contract so old and new application versions
  can overlap during rolling deployment.
- Releases use immutable image digests.
- Deployment never runs `makemigrations`; committed migrations are reviewed.
- Rollback reverts application images, not destructive migrations.
- PostgreSQL and object storage are backed up and restore-tested.

## Explicit non-goals

The architecture does not include payments, ads, chat, multiplayer rooms,
organizations, collaborative editing, remixing, proof uploads, push
notifications, mobile apps, or an ML recommender. New UI or schema for those
features requires a separate product decision.
