# Important API contract evidence — 2026-10-08

This bounded section 82 inventory maps source and assertions. Counts alone do not
prove endpoint contracts. Bind these references to the final source-specific test
run in the evidence log; real edge/provider latency and rollout remain separate.

| Endpoint family | Relevant access, input, limits and replay contracts | Test references under `backend/` |
| --- | --- | --- |
| Account authentication/credentials | Email/token/password validation, CSRF on anonymous unsafe requests, anti-enumeration, scoped quotas, one-use/expiry, fresh credential and step-up row locks, no-setter legacy-hash verification, durable notice recovery | `tests/test_accounts.py`, `test_scoped_rate_limits.py`, `test_credential_transactions.py`, `test_account_email_recovery.py`, `test_account_step_up_transactions.py` |
| Profiles/privacy/preferences/sessions/deletion | Owner writes, avatar owner/status/kind, independent public privacy, owner-scoped revocation, no raw session key/IP in responses, separate session-status quota, 24/100 profile/session subresource pagination | `test_accounts.py`, `test_api_boundaries.py`, `test_security_regressions.py`, `test_session_cookie_races.py`, `test_logout_event.py` |
| Catalog/drafts/publication/history/management | Public/direct-link/owner visibility, verified writes, filter/document bounds, 512 KiB normalized document, version/ETag conflicts, immutable revisions and keyed replay; bounded draft/history envelopes with 24/100 limits and paginated related hydration | `test_api_boundaries.py`, `apps/bingos/tests/test_drafts_and_revisions.py`, `test_transaction_boundaries.py`, `test_author_list_pagination.py`, `test_list_and_idempotency_schema.py` |
| Progress and shares | Revision/cell membership, owner progress, CSRF for guest share creation, private share visibility, 100 selected cells/80-character name, scoped share quota, version conflict/reset and actor/session-scoped keyed replay | `apps/plays/tests/test_progress_and_shares.py`, `test_api_boundaries.py`, `test_scoped_rate_limits.py` |
| Social/reports/moderation | Read/write visibility, comment ownership/one reply level, 2,000-character bounds, explicit moderator permissions, comment/report quotas, paginated lists, atomic counters/dedupe and append-only moderation audit | `test_social.py`, `test_social_queries.py`, `test_moderation.py`, `test_api_boundaries.py` |
| Media/upload/protected content | Verified upload and owner/status guards, MIME/signature/size/dimension checks, upload quota, bounded raw parser, immutable processing keys, current public visibility and private no-store protection | `apps/media_assets/tests/test_validation.py`, `test_api_boundaries.py`, `test_security_regressions.py` |
| Account/bingo exports | Verified author bingo export, owner-only status/download, format/revision/key replay, asynchronous 202 despite operational broker failure, sanitized account ZIP, renderer deadline; recovery continues after publish failure and serializes first account jobs | `apps/exports/tests/test_exports.py`, `apps/common/tests/test_jobs.py`, `test_api_boundaries.py`, `test_transaction_boundaries.py` |
| Notifications/interactions/feeds | Recipient scope, unavailable target suppression, event/reference/time validation, sensitive search text projection, hashed anonymous identity, event UUID dedupe; batch 100/metadata 4,000 encoded chars; feed cap 24, notification lists 24/100 | `test_notifications.py`, `test_analytics.py`, `test_api_boundaries.py`, feed/query regressions |
| Public lookup/sitemap | Public visibility, anonymous sitemap, validated singleton canonical integer part, sparse 10,000-PK buckets, capacity 503; author suggestions cap 10, tags 24/100; trusted SSR quota identity | `test_api_boundaries.py`, `test_sitemap_pagination.py`, `test_ssr_throttle_identity.py`, frontend sitemap/server identity tests |

Shared assertions cover strict session/CSRF authentication, normalized DRF
code/message/details/request-ID errors, malformed JSON, readable 429 and
`Retry-After`, and route-template request logging that excludes query/body/header
values. References: `common/authentication.py`, `common/exceptions.py`,
`common/tests/test_observability.py`, `tests/test_unhandled_errors.py`.

OpenAPI validation/diff and generated TypeScript comparison establish contract
generation consistency. Required idempotency headers were previously absent
from generated documentation despite runtime checks; their new annotations and
schema regressions pass in the final local source checks. Draft/history GETs change
from arrays to pagination envelopes; no repository frontend GET caller was
found, but external consumers must adopt the documented response before release.

Timeout settings are bounded: browser API 20 s, direct upload 120 s, SSR 4 s,
Nginx API connect/read 5/60 s, Gunicorn 60 s, export renderer 10 s. Unit/client
cancellation and prior local outage probes test their behavior; they do not
measure every endpoint at the actual provider. Nginx's common body ceiling is
16 MiB (a prior real 17 MiB Content-Length probe returned 413); serializers and
upload kinds apply smaller bounds. Gateway/unhandled 5xx may be non-JSON and are
normalized safely by clients rather than promised to use a DRF envelope.

Final local backend integration passes **363 tests / one infrastructure skip**;
schema generation and generated client types match. The real local broker-failure
probe retains registration 202/pending intent and delivers after manual normal
broker republish. Outstanding: exact-source release gate; actual edge trust,
remaining per-route network measurements, provider timeouts and scaled concurrent
load. Section 82 stays partial until its relevant individual bullets are proved.
