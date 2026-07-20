# Domain model

## Conventions

- PostgreSQL is authoritative.
- Internal relationships use `bigint` primary keys for compact indexes.
- Externally addressable entities also have an immutable unique UUID public ID.
- Shared-result IDs use at least 128 bits of cryptographic randomness encoded
  URL-safely and are never sequential.
- Timestamps are timezone-aware UTC: `created_at`, `updated_at`, and where
  relevant `deleted_at`.
- User-generated entities use soft deletion or a moderation state when
  references must survive.
- Public API responses never expose internal primary keys.
- Mutable aggregate rows use a version integer for optimistic concurrency.
- Published revision content and moderation actions are append-only.

UUIDv4 is the portable initial default. A future ordered public-ID scheme must
not change existing identifiers or weaken unpredictability.

## Accounts and profiles

### User

- internal primary key;
- `public_id` UUID, unique and immutable;
- normalized `email`, case-insensitive unique;
- normalized `username`, case-insensitive unique;
- password hash;
- `email_verified_at`;
- status: active, deletion_pending, suspended, deleted;
- staff/superuser flags;
- last login and standard timestamps.

Use Django's custom user model from the first migration. Email and username
uniqueness must be enforced using normalized values/database constraints, not
only serializers.

### UserProfile

One-to-one with User:

- display name;
- optional avatar `MediaAsset`;
- optional biography;
- denormalized follower/following/public-bingo counts;
- timestamps.

Counters are cache-like and periodically reconciled from source rows.

### UserPrivacySettings

One-to-one with User. Independent booleans control public visibility of:

- biography;
- created bingos;
- play history;
- shared results;
- followers;
- following.

Privacy settings cannot make private or unlisted bingo content public.

### EmailVerification

- user;
- purpose: verify email or change email;
- token digest, never raw token;
- target email digest/value according to purpose;
- expiry;
- consumed/revoked timestamp;
- request metadata needed for abuse review.

Index active tokens by user/purpose/expiry. Token consumption is atomic.

### AccountSession

Django's server-side session remains authoritative. Metadata adds:

- user;
- digest/reference to session key;
- created, last seen, expiry, revoked timestamps;
- user-agent summary and coarse IP/security metadata;
- current-session indicator computed at request time.

Revocation deletes/invalidates the server session and records the security
event. Raw cookies and full session keys are not logged.

### Follow

- follower user;
- followed user;
- created timestamp.

Constraints:

- unique `(follower_id, followed_id)`;
- check `follower_id <> followed_id`;
- indexes in both directions ordered by creation time.

## Bingo aggregate

### Bingo

The stable logical identity addressed by `/bingo/{public_id}`:

- author;
- public ID;
- current title and optional description for author/dashboard display;
- size 3–10;
- status: draft, published, archived, deleted;
- visibility: public, unlisted, private;
- mark style: checkmark, crossout, highlight;
- optional mark configuration validated per style;
- optional current cover/background assets;
- current published revision, nullable;
- draft/version timestamps;
- moderation visibility state;
- denormalized view/like/comment/start/share counters.

The current fields support author dashboards and catalog queries; a published
page renders revision snapshot fields.

Indexes include author/status, visibility/status/published time, moderation
state, and public ID.

### Draft

One active draft per Bingo:

- bingo, unique;
- based-on revision, nullable;
- validated JSON document;
- optimistic `version`;
- editor schema version;
- author/update timestamps.

The JSON document is appropriate for atomic editor autosave, but is not trusted
until backend validation. It contains board-level values, exactly `size²`
coordinate-addressed cells, tag references/input, and media asset IDs. It never
contains base64, arbitrary HTML, CSS, storage keys, or signed URLs.

### BingoRevision

Immutable published snapshot:

- bingo;
- monotonic revision number;
- title and description snapshot;
- size;
- visibility at publish;
- mark style/configuration snapshot;
- cover/background asset snapshot;
- published by and published timestamp;
- document schema version;
- optional canonical document hash.

Constraints:

- unique `(bingo_id, revision_number)`;
- size check 3–10;
- no update through normal application services;
- protected from deletion while referenced by a shared result.

### BingoCell

Immutable cell belonging to a BingoRevision:

- revision;
- zero-based row and column;
- stable position `row * size + column`;
- plain text;
- text color;
- bold, italic, underline, strikethrough;
- background color and decimal opacity;
- optional image asset and decimal opacity;
- border color, integer width, and enumerated style.

Constraints:

- unique `(revision_id, row, column)`;
- unique `(revision_id, position)`;
- row/column/position within revision size, enforced by domain validation and
  publish tests;
- opacity between 0 and 1;
- border width within configured bounds;
- colors use a canonical server-validated representation.

Published text is plain text. The renderer must not interpret cell text as
HTML.

### Tag and BingoTag

Tag:

- canonical name;
- unique normalized slug;
- moderation state;
- usage count.

BingoTag:

- bingo;
- tag;
- ordering/creation metadata;
- unique `(bingo_id, tag_id)`.

A revision also snapshots its ordered tag set (for example through
`BingoRevisionTag`) so old shared results do not change when the author retags
the current bingo. Maximum 15 tags is enforced server-side.

## Media

### MediaAsset

- owner;
- public ID;
- purpose: avatar, cover, board background, cell image, export, data export;
- state: pending, uploaded, scanning, ready, rejected, quarantined, deleted;
- random object key and bucket identifier;
- declared and detected MIME;
- extension derived by the server;
- byte length, pixel dimensions, checksum;
- derivative relationship, if any;
- created, finalized, ready, expiry, and deleted timestamps;
- rejection reason safe for UI.

Storage credentials, presigned query strings, and raw EXIF are not persisted in
application-visible fields. Object keys are never user-provided.

Indexes support owner/state/created time and orphan cleanup. Reuse/deduplication
must never leak another user's asset existence.

## Playing and sharing

### PlayProgress

- user;
- bingo;
- exact revision;
- validated ordered/set representation of selected cell positions;
- optimistic version;
- created, updated, and reset timestamps.

For the initial product there is one active record per `(user, bingo)`.
Selection can be stored as a compact JSON array because a board has at most 100
positions; validation rejects duplicates and out-of-range values.

Guest current progress stays in browser storage and is not an account.

### SharedResult

- unpredictable public share ID;
- bingo and exact revision;
- optional owner user;
- immutable owner display-name snapshot;
- selected cell positions;
- creation timestamp;
- access envelope and moderation state;
- optional revoked/hidden timestamp distinct from snapshot data.

The route validates both `bingoId` and `shareId`. Snapshot fields are immutable.
A result created from a private revision is owner-only. Hiding/revocation
changes availability, never the snapshot.

Constraints verify positions belong to the revision and at least one of owner
user/guest display-name rules is satisfied.

## Social

### BingoLike

- user;
- bingo;
- created timestamp;
- unique `(user_id, bingo_id)`.

Create/delete is idempotent. Counter changes use the same database transaction
and `F()` expressions, with reconciliation jobs correcting drift.

### Comment

- public ID;
- bingo;
- author;
- optional parent root comment;
- body as plain text;
- created/edited timestamps;
- author soft-delete timestamp;
- moderation state and timestamps.

The service accepts only:

- root with no parent;
- reply whose parent is a root on the same bingo.

Replies cannot be parents. Root pagination has a stable ordering; replies are
prefetched in bounded batches. Soft-deleted roots retain a tombstone so replies
remain threaded.

### CommentLike

- user;
- comment;
- created timestamp;
- unique `(user_id, comment_id)`.

Root comments and replies use the same like model and race-safe counter rules.

## Notifications

### Notification

- recipient;
- actor, nullable for system events;
- kind: bingo comment, reply, bingo like, comment like, follow;
- explicit target references/public IDs;
- safe immutable display payload;
- deduplication key/window;
- created and read timestamps.

The model must not depend on content that may later be deleted to render a
minimal safe notification. A constraint/service ensures each kind has the
expected target.

### NotificationPreference

One row per user with independent in-app toggles for supported types. Security
email cannot be disabled through these preferences.

## Reports and moderation

### Report

- public ID;
- reporter;
- exactly one target: bingo, comment/reply, or profile user;
- reason and optional description;
- status: open, reviewing, resolved, dismissed;
- safe context snapshot;
- assigned/resolving moderator;
- resolution and timestamps.

Explicit nullable foreign keys plus a check constraint are preferred over an
unconstrained generic relation for the supported target types.

### ModerationAction

Append-only audit event:

- moderator;
- optional report;
- target identity;
- action: hide, restore, soft delete, suspend, unsuspend, dismiss;
- reason;
- before/after security-safe metadata;
- timestamp and request ID.

Application code does not update or delete moderation actions.

## InteractionEvent

Append-only event for future recommendation and product analytics:

- event ID and timestamp;
- event type: impression, view, open, like, unlike, start, complete, reset,
  share, comment, follow, search, tag interaction;
- optional actor user;
- privacy-preserving guest/session identifier;
- target type and public ID;
- bingo/revision where applicable;
- request/idempotency identifier;
- bounded JSON properties;
- source surface.

Indexes serve target/time and actor/time queries. At scale the table can be
time-partitioned or exported to an analytics store without changing the write
contract. Event payloads must not include passwords, tokens, private document
contents, free-form search data beyond the retention policy, or raw IPs.

## Deletion and foreign-key policy

- User account erasure anonymizes retained public/audit records according to
  policy rather than cascading through the content graph.
- Bingo deletion is soft deletion/archive first.
- Revision deletion is protected when a shared result references it.
- Media deletion is asynchronous and only occurs after all references and
  retention holds are gone.
- Comment deletion is a tombstone when replies exist.
- Likes/follows can cascade when an account is finally erased because they are
  relationship state, not authored content.
- Reports and moderation actions use protected or anonymized actor references.
- Notification rows may expire by retention policy.
- Interaction events are pseudonymized/expired by the analytics policy.

## Query and index policy

- List serializers use explicit `select_related`/`prefetch_related`.
- Current list APIs use bounded page-number pagination with deterministic
  secondary keys such as `(published_at, id)` or `(created_at, id)`; these keys
  preserve a clean migration path to cursors when scale requires it.
- Public catalog indexes begin with visibility/status/moderation predicates.
- Case-insensitive email, username, tag, and search behavior is backed by
  database normalization/indexes.
- New indexes are justified with query plans; unused indexes are removed.
- CI tests query counts for high-traffic list/detail paths.
