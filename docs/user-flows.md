# Primary user flows

This document describes user-visible outcomes and the server invariants behind
them. Error, empty, loading, and permission states are part of each flow.

## Registration and verified creation

1. Guest submits email, username, and password.
2. Server creates an inactive/unverified account without revealing whether an
   email already exists.
3. A single-use, hashed, expiring verification token is emailed asynchronously.
4. User opens the verification link; server consumes the token atomically.
5. User signs in and receives a rotated server-side session cookie.
6. Only a verified user can create/save/publish a bingo.

Expired links can be resent within a rate limit. Login, reset, and verification
responses must resist account enumeration.

## Create, autosave, and publish

1. Verified author creates a logical bingo and initial draft.
2. Editor loads a typed document and its current version/ETag.
3. Local edits update reducer state; debounced autosave sends the complete
   validated document with `If-Match`.
4. Media is uploaded through asset intents and the draft references ready asset
   IDs.
5. Author enters title, optional description, tags, cover, visibility, and mark
   style.
6. Publish validates ownership, verification, document completeness, asset
   readiness, quotas, and moderation state.
7. One transaction creates the immutable revision/cells and points the bingo at
   it.
8. A newly public bingo becomes catalog-eligible only after commit.

If autosave receives a conflict, the UI stops claiming the draft is saved and
offers reload/reconciliation rather than overwriting a newer version.

## Edit a published bingo

1. Author opens the current bingo in edit mode.
2. Server creates or reuses a draft based on the current revision.
3. Author edits without changing the published revision.
4. Publishing creates the next immutable revision.
5. Existing shared results continue to render their referenced revision.

Archive/soft delete removes the bingo from public discovery. It does not
cascade-delete revisions needed by shared results.

## Guest play, Reset, and share

1. Guest opens a public bingo or an unlisted bingo by direct link.
2. Browser stores one current selection for that bingo/revision locally.
3. Guest marks cells using the revision's board-wide mark style.
4. Reset clears only the current local selection and emits a reset event.
5. Guest may play again immediately.
6. To share, guest enters a non-unique display name.
7. Server validates revision accessibility and creates an immutable snapshot
   with a cryptographically random public share ID.
8. Browser navigates to `/share/{bingoId}/{shareId}`.

The shared page is read-only, names the owner snapshot, links to the source
bingo, and offers a separate “play this bingo” action. Reset can never alter an
existing shared result.

## Registered play

1. Authenticated user opens an accessible bingo.
2. Server returns one current progress record for that user and bingo.
3. Mark changes are persisted with optimistic concurrency or idempotent
   selection replacement.
4. Reset clears the progress selection but not interaction history or shared
   results.
5. Creating a shared result snapshots the current revision and selected cells.

When a new bingo revision appears, the server must not silently reinterpret old
cell positions. The user is prompted to start the current revision or continue
the explicitly supported old progress.

## Shared result read

1. Visitor requests `/share/{bingoId}/{shareId}`.
2. Backend verifies the route pair, availability envelope, revision access
   policy, and moderation state.
3. Response contains the immutable owner name, selected positions, mark style,
   revision cells, and source link.
4. No mutation controls are rendered.

A private-derived result is owner-only and never becomes accessible merely
because its random URL is known. A public/unlisted result can be hidden by
moderation without mutating its snapshot.

## Explore, Trending, and Discover

- Explore searches public bingos by title/author and filters by tags.
- Trending returns public content ordered by the documented decayed score.
- Discover combines followed authors, tag affinity, and public fallback.
- Guests receive public Trending/recent content.
- Every feed emits deduplicated impression events without logging private
  document contents.

Unlisted and private bingos are excluded at queryset level, not filtered out
after pagination.

## Social interactions

### Like

An authenticated user toggles a bingo/comment like. A unique constraint allows
one row per actor and target. The mutation is idempotent and the displayed
counter is updated transactionally.

### Comment and reply

1. Authenticated user creates a root comment.
2. Another user creates a reply whose parent is that root.
3. A reply target is normalized to the root; depth three is rejected.
4. Author may edit or soft-delete their own comment.
5. Deleting a root preserves its placeholder and replies.
6. Bingo author may report but cannot delete another user's comment.

### Follow

An authenticated user follows another active user. Database constraints reject
duplicates and self-follow. A deduplicated notification is queued after commit.

## Reports and moderation

1. Authenticated reporter selects a target, reason, and optional description.
2. Server creates a report with a safe context snapshot and applies rate limits.
3. Staff opens the Django Admin queue and sees target plus surrounding context.
4. Moderator records an action: no action, hide, restore, soft delete, or
   suspend user.
5. Every change produces an immutable `ModerationAction`.
6. Notification/email behavior follows policy without exposing reporter
   identity to the target.

Content restoration never deletes the audit history.

## Account export and deletion

- Export creates an authenticated, rate-limited Celery job and short-lived
  private download.
- The archive contains the user's data and references, not secrets or other
  users' private fields.
- Deletion requires recent authentication and a critical-security email.
- A grace state blocks new activity and revokes sessions.
- After the grace period, personal fields are erased/anonymized while
  integrity-critical public snapshots and moderation/audit records follow the
  documented retention policy.
