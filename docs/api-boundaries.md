# API boundaries

## Protocol contract

- Base path: `/api/v1/`.
- JSON uses UTF-8 and `snake_case`.
- Date/time values are ISO 8601 UTC.
- Public IDs are opaque strings.
- Unsafe requests use the authenticated server session plus a valid CSRF token.
- Browser credentials are sent only to the same application origin.
- The API is described by OpenAPI and the frontend client is generated from
  that schema; duplicated handwritten DTOs are not authoritative.

The API must never accept an internal database primary key from a public route.

## Errors

Errors use one stable application envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request could not be processed.",
    "details": {
      "title": [
        {
          "code": "required",
          "message": "This field is required."
        }
      ]
    },
    "request_id": "opaque-request-id"
  }
}
```

Authentication endpoints return deliberately similar messages for unknown
email, wrong password, inactive account, resend, and password-reset requests.
Permission responses do not confirm the existence of a private object.

## Pagination, filtering, and ordering

- Page-number pagination is currently used consistently for catalogs, feeds,
  profile collections, notifications, comments, replies, and moderation queues.
- Every collection has a server-controlled default/max page size and stable
  secondary ordering so a later cursor migration does not require changing
  resource representations.
- Default and maximum page sizes are server controlled.
- Ordering values are an allowlist, never raw SQL field names.
- Filters are typed and validated.
- Root comments include at most five reply previews; the dedicated replies
  endpoint is independently paginated.

Every list query applies access visibility before pagination.

## Concurrency and idempotency

### Optimistic concurrency

Draft responses include an ETag/version. Updates require:

```http
If-Match: "draft-42"
```

A stale update returns `412 Precondition Failed` with the current version
metadata. The client must not silently retry by overwriting.

### Idempotency keys

`Idempotency-Key` is required for mutations where browser retry could create
duplicate durable work:

- draft/bingo creation;
- publish;
- shared result creation;
- bingo export requests.

Keys are scoped to authenticated actor or guest session, route, and canonical
request hash. Reusing a key with a different body is an error. Stored responses
expire after a documented window.

Account export/deletion, open reports, likes, follows, notification read-state,
and progress replacement are naturally idempotent resource state operations.
Abandoned upload intents are bounded by quota and removed by application and
object-storage lifecycle cleanup.

## Endpoint groups

The final route names are fixed by the generated schema; the following defines
service boundaries, not every serializer detail.

### Authentication

```text
GET    /api/v1/auth/csrf/
POST   /api/v1/auth/register/
POST   /api/v1/auth/verify-email/
POST   /api/v1/auth/resend-verification/
POST   /api/v1/auth/login/
POST   /api/v1/auth/logout/
GET    /api/v1/auth/me/
GET    /api/v1/auth/sessions/
DELETE /api/v1/auth/sessions/{session_id}/
POST   /api/v1/auth/password-reset/
POST   /api/v1/auth/password-reset/confirm/
POST   /api/v1/auth/password-change/
```

Login rotates the session identifier. Logout is a CSRF-protected POST.

### Account, profile, and privacy

```text
GET    /api/v1/profiles/me/
PATCH  /api/v1/profiles/me/
GET    /api/v1/profiles/privacy/
PATCH  /api/v1/profiles/privacy/
GET    /api/v1/profiles/{username}/
GET    /api/v1/profiles/{username}/bingos/
GET    /api/v1/profiles/{username}/play-history/
GET    /api/v1/profiles/{username}/shared-results/
GET    /api/v1/profiles/{username}/followers/
GET    /api/v1/profiles/{username}/following/
POST   /api/v1/auth/account-export/
POST   /api/v1/auth/account-deletion/
DELETE /api/v1/auth/account-deletion/
```

Profile subresources apply each privacy flag and content visibility
independently.

### Follows

```text
POST   /api/v1/profiles/{username}/follow/
DELETE /api/v1/profiles/{username}/follow/
```

Both operations are idempotent. Suspended/deleted/self targets are rejected.

### Bingos, drafts, and revisions

```text
POST   /api/v1/bingos/
GET    /api/v1/bingos/{bingo_id}/
DELETE /api/v1/bingos/{bingo_id}/
GET    /api/v1/drafts/
POST   /api/v1/drafts/
POST   /api/v1/bingos/{bingo_id}/archive/
POST   /api/v1/bingos/{bingo_id}/restore/
GET    /api/v1/bingos/{bingo_id}/draft/
PUT    /api/v1/bingos/{bingo_id}/draft/
POST   /api/v1/bingos/{bingo_id}/publish/
GET    /api/v1/bingos/{bingo_id}/revisions/
```

Only the owner can read a private/draft bingo. Public and unlisted detail reads
return the current published revision; old revisions are returned only through
authorized/share-result contexts, not as an enumeration surface.

### Uploads and exports

```text
POST   /api/v1/uploads/intents/
PUT    /api/v1/uploads/{asset_id}/content/
POST   /api/v1/uploads/{asset_id}/complete/
GET    /api/v1/uploads/{asset_id}/
DELETE /api/v1/uploads/{asset_id}/
GET    /api/v1/media/{asset_id}/
POST   /api/v1/bingos/{bingo_id}/exports/
GET    /api/v1/exports/{export_id}/
```

Upload intent purpose, file limits, ownership, and quota are server validated.
Export download URLs are short-lived and private.

### Progress and shared results

```text
GET    /api/v1/progress/{bingo_id}/
PUT    /api/v1/progress/{bingo_id}/
DELETE /api/v1/progress/{bingo_id}/
POST   /api/v1/bingos/{bingo_id}/shares/
GET    /api/v1/shares/{bingo_id}/{share_id}/
```

Progress endpoints require authentication. Shared-result creation accepts
either an authenticated owner or a guest display name/session proof. Shared
result GET is read-only and route-pair validated.

### Tags, search, and feeds

```text
GET    /api/v1/tags/
GET    /api/v1/bingos/?search=&author=&tags=&ordering=
GET    /api/v1/feeds/trending/
GET    /api/v1/feeds/discover/
POST   /api/v1/interactions/
```

The event endpoint accepts only a strict event/property allowlist, applies
sampling/deduplication, and cannot be used as arbitrary log ingestion.

### Bingo likes

```text
POST   /api/v1/bingos/{bingo_id}/like/
DELETE /api/v1/bingos/{bingo_id}/like/
```

Authentication is required. The response returns authoritative like state and
count.

### Comments and replies

```text
GET    /api/v1/bingos/{bingo_id}/comments/
POST   /api/v1/bingos/{bingo_id}/comments/
GET    /api/v1/comments/{comment_id}/replies/
POST   /api/v1/comments/{comment_id}/replies/
PATCH  /api/v1/comments/{comment_id}/
DELETE /api/v1/comments/{comment_id}/
POST   /api/v1/comments/{comment_id}/like/
DELETE /api/v1/comments/{comment_id}/like/
```

Reply creation normalizes/validates the root and rejects third-level nesting.
Edit/delete requires comment ownership; moderation uses separate staff
endpoints/admin actions.

### Notifications

```text
GET    /api/v1/notifications/
POST   /api/v1/notifications/read-all/
POST   /api/v1/notifications/{notification_id}/read/
GET    /api/v1/profiles/notification-preferences/
PATCH  /api/v1/profiles/notification-preferences/
```

Read operations are recipient scoped. Mark-all-read is idempotent.

### Reports and moderation

```text
POST   /api/v1/reports/
GET    /api/v1/moderation/reports/
GET    /api/v1/moderation/reports/{report_id}/
POST   /api/v1/moderation/reports/{report_id}/actions/
```

The moderation API is staff-only and complements Django Admin. Ordinary
authors never receive moderator permission over comments on their bingo.

## Permission matrix

| Resource/action | Guest | Authenticated non-owner | Owner | Staff moderator |
| --- | --- | --- | --- | --- |
| Read public bingo | yes | yes | yes | yes |
| Read unlisted by direct ID | yes | yes | yes | yes |
| Discover public bingo | yes | yes | yes | yes |
| Read private bingo | no/not found | no/not found | yes | policy-controlled |
| Create/edit/publish | no | verified only, own | verified own | no implicit ownership |
| Play public/unlisted | yes | yes | yes | yes |
| Server progress | no | own | own | no |
| Create guest share | accessible non-private revision | n/a | n/a | n/a |
| Comment/like/follow/report | no | active account | active account | active account |
| Edit/delete comment | no | own comment | own comment only | moderation path |
| Read private-derived share | no | no | owner only | policy-controlled |
| Moderation action | no | no | no | permission required |

Staff access to private user content must be purpose-limited and audited; a
staff flag is not a reason to expose private objects in ordinary product APIs.

## OpenAPI and frontend generation

- CI validates schema generation and treats warnings or serializer ambiguity as
  failures.
- CI validates the schema and checks generated frontend files are current.
- Operation IDs are stable and reviewed.
- Examples include success, validation, conflict, throttle, and permission
  errors.
- Cookie/CSRF security schemes are documented.
- Breaking changes require `/api/v2/` or an explicitly managed compatibility
  period.

## Performance boundaries

- Detail queries select revision, author, media, like/progress state in bounded
  query counts.
- Lists never serialize full cell documents.
- Cell documents are fetched on detail/play/editor routes only.
- Comment root pagination does not prefetch unlimited replies.
- Search inputs have length limits and database statement timeouts.
- Exports, thumbnails, email, and account archives never block API workers.
