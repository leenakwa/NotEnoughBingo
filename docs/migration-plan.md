# Migration plan

The phases are ordered so the application never treats browser mocks as an
authoritative data source and never exposes a UI action before its server
invariant exists.

## Phase 0 — Audit and contracts

Deliverables:

- repository audit;
- target architecture;
- domain model and deletion policy;
- user-flow and permission definitions;
- API and media boundaries;
- security baseline;
- local topology, CI skeleton, and operations documentation.

Exit criteria:

- legacy behavior to preserve is explicit;
- missing and fake actions are enumerated;
- new directories and service contracts are agreed;
- no legacy file is deleted before a replacement exists.

## Phase 1 — Foundation

Create:

- `frontend/` Next.js application;
- `backend/` Django/DRF application;
- PostgreSQL, Redis, Celery worker/beat, MinIO, Mailpit, and proxy services;
- environment-specific settings;
- health endpoints and structured request logging;
- migration and seed command conventions;
- CI lint, typecheck, test, migration, and schema checks.

Exit criteria:

- `docker compose up` reaches healthy state;
- migrations run on an empty database;
- frontend reaches backend through same-origin `/api/v1/`;
- local email and object storage are observable;
- no secret is embedded in an image.

## Phase 2 — Authentication and profiles

Implement registration, verification, login/logout, password reset/change,
session listing/revocation, profiles, privacy settings, account export, and
account deletion workflow.

Creation endpoints remain unavailable until the user has a verified email.

Exit criteria:

- authentication is server-session and cookie based;
- CSRF is enforced for unsafe requests;
- enumeration-resistant auth responses and rate limits are tested;
- profile field privacy is enforced by API serializers/querysets, not only UI.

## Phase 3 — Bingo domain and editor

Implement `Bingo`, `Draft`, `BingoRevision`, `BingoCell`, tags, media assets,
publishing, and archive/soft-delete behavior.

Port the editor by mapping the existing state:

| Prototype property | Target field |
| --- | --- |
| `text` | `text` |
| `color` | `text_color` |
| `background` | `background_color` |
| `backgroundOpacity` | `background_opacity` |
| `image` Data URL | `image_asset_id` |
| `imageOpacity` | `image_opacity` |
| `borderColor` | `border_color` |
| `borderWidth` | `border_width` |
| `borderStyle` | `border_style` |
| `formats.strike` | `strikethrough` |
| linear `index` | explicit `row`, `column`, and stable position |

Selection, drag state, inspector visibility, and mixed-format state are UI-only
and must never become part of a published document.

Exit criteria:

- autosave uses optimistic concurrency;
- media is uploaded through the asset workflow;
- publish atomically freezes a complete immutable revision;
- editing a published bingo creates a new draft and later a new revision;
- old revisions remain readable.

## Phase 4 — Playing and sharing

Implement:

- `/bingo/{bingoId}`;
- checkmark, crossout, and highlight mark styles;
- guest browser progress;
- registered server progress;
- Reset;
- immutable shared result creation;
- `/share/{bingoId}/{shareId}` read-only rendering.

Exit criteria:

- guest play does not require registration;
- Reset cannot mutate a shared result;
- a shared result renders the exact referenced revision after later edits;
- private bingo and private-derived results never receive public access.

## Phase 5 — Social functionality

Add follows, bingo likes, root comments, one-level replies, comment likes, and
internal notifications.

Exit criteria:

- uniqueness and no-self-follow constraints exist in the database;
- counter updates are transaction-safe and reconcilable;
- deleted root comments preserve reply structure;
- bingo authors cannot moderate other users' comments;
- notification fan-out is deduplicated and preference aware.

## Phase 6 — Discovery

Replace the legacy routes:

- `foryoupage.html` → `/discover`;
- `main.html` → `/trending`;
- `allbingopage.html` → `/explore`.

Implement indexed search/filter/sort, paginated Explore, documented Trending,
rule-based Discover, and append-only interaction events.

Exit criteria:

- only public content enters catalogs;
- unlisted content is direct-link only;
- private content is excluded at queryset level;
- empty/loading/error states are present;
- the rule-based feed is not represented as ML.

## Phase 7 — Moderation

Implement reports for bingos/comments/profiles, moderation context snapshots,
admin queue, hiding/restoring, soft deletion, suspension, and immutable
moderator actions.

Exit criteria:

- every moderator write is attributable and timestamped;
- hidden content disappears from public queries without destroying evidence;
- suspension and restoration are tested;
- admin access requires staff permissions and strong operational controls.

## Phase 8 — Hardening and legacy removal

- complete permission and privacy matrix tests;
- add upload abuse and concurrency tests;
- enforce query budgets and fix N+1 paths;
- run accessibility and responsive review;
- complete the required Playwright scenarios;
- validate CSP, headers, redaction, throttles, backup, and restore;
- remove mock content, dead static links, and legacy root HTML/CSS/JS;
- pin production image and dependency versions;
- produce an SBOM and review licenses.

Exit criteria are the project Definition of Done, green CI, a successful restore
drill, and no visible UI control backed only by a placeholder.
