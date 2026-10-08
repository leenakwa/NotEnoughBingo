# Important API contract evidence — 2026-10-08

This bounded section 82 inventory maps source and assertions. Counts alone do not
prove endpoint contracts. Bind these references to the final source-specific test
run in the evidence log; real edge/provider latency and rollout remain separate.

| Endpoint family | Relevant access, input, limits and replay contracts | Test references under `backend/` |
| --- | --- | --- |
| Account authentication/credentials | Email/token/password validation, CSRF on anonymous unsafe requests, anti-enumeration, scoped quotas, one-use/expiry, fresh credential and step-up row locks, no-setter legacy-hash verification, durable notice recovery | `tests/test_accounts.py`, `test_scoped_rate_limits.py`, `test_credential_transactions.py`, `test_account_email_recovery.py`, `test_account_step_up_transactions.py` |
| Profiles/privacy/preferences/sessions/deletion | Owner writes, avatar owner/status/kind, independent public privacy, owner-scoped revocation, no raw session key/IP in responses, separate session-status quota, 24/100 profile/session subresource pagination | `test_accounts.py`, `test_api_boundaries.py`, `test_security_regressions.py`, `test_session_cookie_races.py`, `test_logout_event.py` |
| Catalog/drafts/publication/history/management | Public/direct-link/owner visibility, verified writes, filter/document bounds, 512 KiB normalized document, version/ETag conflicts, immutable revisions and keyed replay; bounded draft/history envelopes with 24/100 limits and paginated related hydration | `test_api_boundaries.py`, `apps/bingos/tests/test_drafts_and_revisions.py`, `test_transaction_boundaries.py`, `test_author_list_pagination.py`, `test_list_and_idempotency_schema.py`, `test_request_size_limits.py` |
| Progress and shares | Revision/cell membership, owner progress, CSRF for guest share creation, private share visibility, 100 selected cells/80-character name, scoped share quota, version conflict/reset and actor/session-scoped keyed replay | `apps/plays/tests/test_progress_and_shares.py`, `test_api_boundaries.py`, `test_scoped_rate_limits.py` |
| Social/reports/moderation | Read/write visibility, comment ownership/one reply level, 2,000-character bounds, explicit moderator permissions, comment/report quotas, paginated lists, atomic counters/dedupe and append-only moderation audit | `test_social.py`, `test_social_queries.py`, `test_moderation.py`, `test_api_boundaries.py` |
| Media/upload/protected content | Verified upload and owner/status guards, MIME/signature/size/dimension checks, upload quota, bounded raw parser, immutable processing keys, current public visibility and private no-store protection | `apps/media_assets/tests/test_validation.py`, `test_api_boundaries.py`, `test_security_regressions.py`, `test_request_size_limits.py` |
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

The [dated evidence](production-readiness-evidence.md) records source-specific
backend runs, schema comparison and broker-failure recovery. Independent item
review maps all twelve section82 bullets to applicable local contracts.

Seven request-size cases in `tests/test_request_size_limits.py` cover bounded
reads without Content-Length, actual oversized PUTs without database/storage/
enqueue changes, normalized UTF-8 bounds, retained draft/version/ETag and real-cap
malformed bodies. The byte-cap test lowers its threshold because valid bounded
fields cannot reach the real512KiB cap.

Native stalled HTTP200 bodies exercise the browser20s and SSR4s deadlines; current
units also cover body cancellation, timeout classification and upload120s guards.
The [actual Nginx report](artifacts/nginx-upstream-deadlines-2026-10-08.json) records
three unchanged-template upstream read deadlines: health10.029s, API60.014s and
auth60.022s. Every504 returns the original recovery HTML with no-store; one upstream
request per probe. These are inactivity deadlines for an upstream that sends no
headers, not a total-transfer limit. Connect/send/frontend120s and real provider/
CDN/TLS latency, capacity and deployment remain unmeasured. This bounded local
contract evidence closes section82 before deployment, not the overall release.

Important transaction evidence is mapped across persisted publication/profile,
credential/session/audit, registration/email/deletion intent and export graphs.
The new follow fault cases first reproduced partial committed relationships on
both routes; minimal method transactions now pass late notification/event SQL
failure, clean retry and cross-route deduplication. Six further moderation/share
cases demonstrate final SQL failure after mutations, complete graph restoration,
discarded callbacks and coherent retry/replay, including session recovery and
expired idempotency retention. Files: `test_follow_transactions.py`,
`test_business_graph_rollback.py`, alongside `test_transaction_boundaries.py`,
`test_credential_transactions.py`, `test_account_email_recovery.py` and
`test_account_step_up_transactions.py`. Independent correctness/coverage review
and PostgreSQL fault-case results support checking §42 transactions for
these relevant local business boundaries. Broker delivery, post-commit process
failure and deployment/migration compatibility remain separately constrained.


## Private response and logging scope — 2026-10-08

Six optimized-source065/old-backendc1 read-only cases record exact field names,
not private values: session/me own fields, owner session metadata without raw
session keys, public profile/author without email/auth fields, and two dummy
bearer documents with no-referrer. Among68 requests no downstream dummy token
URL/Referer appears; initial required links are excluded. This is scoped traffic,
not all-response or global network privacy evidence. The existing
[native artifact](artifacts/native-form-keyboard-2026-10-08.json) records limits.

Actual auth/me and sessions headers lack no-store. Current-source Django tests
also reproduce missing headers on own profile (three failures; session status
passes). A dedicated authenticated API middleware now adds private,no-store,
including logout, restored deletion sessions, errors and304; anonymous/static
rules and validators retain their semantics. Thirteen new cache tests and33
account tests pass; combined cache/account/observability/client-error set77 pass.
Ruff/scoped mypy and independent review pass. Exact PostgreSQL CI and new configured
runtime are pending; earlier SQLite PostgreSQL-only failures remain recorded.
