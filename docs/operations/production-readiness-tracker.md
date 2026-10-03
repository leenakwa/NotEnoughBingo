# NotEnoughBingo predeployment readiness tracker

The complete user prompt is preserved [byte-for-byte](production-readiness-prompt.txt)
(105 numbered sections, 40,643 bytes, SHA-256
`7b920f477e1087c2fe456f7bdbafef11e00e7be8ca17bc8ec99f180c274b65d9`).
Its [working checklist](production-readiness-checklist.md) includes every original
requirement as a checkbox: 1,142 items. The source prompt, including its final
sequence and definition of done, remains authoritative.

## How to read this tracker

This is a **before-deployment** assessment of the actual NotEnoughBingo
repository and its locally running production-equivalent services. A section
can be marked verified before deployment when every applicable item has
observed evidence and any deployment-specific value has a safe configuration
contract. Do not hold the entire product at zero merely because the public
hostname does not exist yet. Do not infer an item's result from code alone.

- **Verified**: every applicable predeployment requirement has evidence.
- **Partial**: at least one section-specific result is in the
  [evidence log](production-readiness-evidence.md); unchecked bullets still
  need review or a fix. This is **not** a pass for the whole section.
- **Review pending**: no section-specific verdict is recorded yet. Some work
  may already exist in the [earlier assessment](release-assessment-2026-09-29.md),
  but it must be mapped to the original bullets before this status changes.
- **N/A for this release**: source inventory found no relevant feature. Reopen
  the section if that feature enters the release.
- **Deployment-only**: the original section explicitly requires the live
  deployment. Prepare its script and inputs before release; run it during
  rollout without reopening the whole product audit.

Snapshot for 2026-10-03: **55 verified**, **43 partial**, **0 awaiting itemized review**, **6 N/A**, **1 deployment-only**.
These counts describe predeployment evidence, not a readiness percentage. The
release cannot be considered ready while applicable predeployment bullets have
unresolved failures or missing evidence.

## Repository review map

### Current requirements override — 2026-10-03

The user confirmed that all new local UI changes are intentional: account forms
open in dialogs, registration language choice is a one-time dialog, language
preferences stay in profile settings, and catalog/search language pickers are
removed. The fixed header and revised hover/shadow treatment are also retained.
The original prompt is preserved unchanged. Earlier language-picker observations
are historical evidence, not a requirement to restore removed controls. The previous 56/42 snapshot predates these changes; section 58 was reopened
for comment-cache cleanup when both cross-tab mechanisms are unavailable. Combined UI source `e6a54dc`
passed all nine CI jobs, including 56 live flows and 176 smoke checks.
Exact-source CI on `29ac99b` then passed all nine jobs, including the database
audit and browser-error collection: 206 backend tests, 166 frontend tests,
179 smoke checks and 57 live flows. Social-form source `b466456` then passed
all nine jobs: 206 backend tests, 172 frontend tests, 180 smoke checks and
59 live flows. Silent-autofill source `1f4a773` also passed all nine jobs (one WebKit smoke
retry); the subsequent social-validation `eca9298` live/release gate failed on
an API-session assertion. Its corrected browser assertion and root-comment
recovery passed all nine jobs on `8a5d31a` (206 backend, 192 frontend, 196 smoke
with 12 skips, 64 live). Later report recovery `a9b3cc4` has local evidence
but its gate failed on four report fixture-order cases and one old-document
diagnostic request in WebKit. Corrections and reply/edit recovery now passed
209 frontend tests and all 72 local live flows. Source `e6858a0` then passed all nine CI jobs (216 backend, 209 frontend, 196 smoke plus 12 skips, 72 live); the later query correction `8299cbf` passed all nine jobs (220 backend, 209 frontend, 72 live; smoke 194 passes plus two WebKit retries and 12 skips). Email and smoke-readiness source `94ee150` then passed all nine jobs (235 backend, 209 frontend, 200 smoke passes with 12 intentional skips and no retries, 72 live). Frontend-release source `b5ebaff` then passed all nine jobs (240 backend, 221 frontend, 200 smoke passes plus 12 intentional skips without retries, 72 live). Partial-settings source `7381042` then passed all nine jobs (240 backend, 226 frontend, 200 smoke passes plus 12 intentional skips without retries, 74 live). Editor hydration source `371dd1b` then passed all nine jobs (240 backend, 231 frontend, 200 smoke passes plus 12 intentional skips without retries, 76 live). Catalog/player source `6eaaf25` then passed all nine jobs (240 backend, 240 frontend, 200 smoke passes plus 12 intentional skips without retries, 78 live). Editor mutation source `6bcc3ef` failed CI (39 live passes, two failures, 40 not run; other checks/images and 200 smoke plus 12 skips passed). Own-draft upload continuity, isolated cleanup and player lifetime source `07d3e41` then failed one live WebKit page-error assertion (82 passes; other checks/images passed). Native editor URL/query sync, card lifetime and active-profile-tab corrections now pass 262 frontend tests and nine engine cases locally and need their own gate. Remaining checklist bullets need individual evidence.

- Product/UI: `frontend/app`, `frontend/features`, `frontend/components`,
  `frontend/tests/e2e`, and browser checks on the isolated `nebqa` stack.
- API/data/security: `backend/apps`, `backend/config`, backend tests, PostgreSQL,
  Redis, and isolated object storage.
- Release/operations: `compose.yml`, `infra`, `.github/workflows/ci.yml`,
  production Dockerfiles, and the [deployment runbook](production-deployment.md).
- Every checked result needs a dated observation in the evidence log. The
  checklist's unmarked bullets remain open even if a nearby section has a
  passing test.

## Section verdicts

- [x] 1. BASIC LAUNCH DETAILS — Verified before deployment: real metadata/icons/404/error and first-screen routes, loading/empty/success states, session/reset/account-switch flows, mobile/Safari and production browser probes passed. The production image requires a same-origin browser API path and explicit non-local backend address, while its public HTTPS origin and staging index policy are validated. Actual domain/provider checks remain part of rollout.
- [x] 2. FIRST-SCREEN / PRODUCT CLARITY — Verified before deployment: a guest can see what to do, the primary Find a bingo action and secondary Create action, free guest play and signup requirement; at 320×667 both actions fit entirely in the first viewport after moving the intro ahead of the language filter. This is a manual browser/heuristic check, not an external user-comprehension study.
- [x] 3. NAVIGATION — Verified before deployment: branded home and header/footer links, active-route labels, Back/Forward with profile recovery, direct/new-tab/reloaded routes and URL-restored Explore/share state passed. Dialog/disclosure Escape/outside and sticky-anchor behavior have live evidence. Navigation is always visible; no mobile menu is present.
- [ ] 4. UI STATES — Partial: first load, loaded/empty/error, offline/retry, authorization, and expired-session journeys were observed in representative routes. Explore removes stale results after a failed filter request; feeds, profile activity, notifications and comments now clear the previous page on failed pagination and expose retry, with browser and component regressions. Account settings now isolate sessions/preferences loading and failures; unaffected security controls stay usable, section retries do not reload identity/other data, and a successful password change remains successful when its sessions refresh fails. Nine related real-stack/browser-engine cases and 14 settings regressions passed. Editor draft hydration now works independently of optional published-download lookup, with independent retries, abort guards and requested-board identity checks; 21 related component cases and six real-stack/browser cases passed. Explore/Discover success callbacks now ignore obsolete results, hints clear on field changes and late unread badges cannot cross accounts. Player author lookup is independent; unknown saved progress blocks changes until retry, preserving actual backend marks despite comment failure. New full frontend check has 240 tests and six related real-stack/browser cases passed across Chromium, mobile WebKit and Firefox. Editor mutation callbacks now stop after departure/draft-route/session boundaries; eight new editor cases, six held-server-response browser cases and one separate blank-Create journey pass. Full frontend check has 248 tests. Player lifetimes now stop queued writes/conflict/reset reads and obsolete share/like callbacks on leave/session boundaries; seven new player cases and six real-stack/browser cases pass. Own-draft URL/upload continuity and isolated cleanup corrected the failed `6bcc3ef` gate paths; seven Chromium journeys and 256 frontend tests pass locally. Shared-result required reads now hide the previous snapshot and ignore aborted success; four unit cases and two normal live journeys pass, with 258 frontend tests locally. Card action lifetime/duplicate-write protection and repeated active-profile-tab selection now have regressions and nine combined editor/card engine cases; full local frontend count is 262. Other component mutation states and broader native/account timing remain.
- [ ] 5. LOADING UX — Partial: page/form pending states, editor save and upload status, long-running account export polling, and completion feedback were exercised; duplicate submission coverage, layout stability, and byte-level large-upload progress still need an itemized sweep. Skeletons are not used in this release.
- [x] 6. ERROR HANDLING — Verified before deployment: relevant 400/401/403/404/409/413/422/429/500 and gateway/network/timeout cases have safe human-readable feedback, retained work and appropriate retry; proxy HTML and parser/exception internals stay out of the interface.
- [ ] 7. FORMS — Partial: registration/login/reset/resend and publication reject simultaneous submissions; registration/reset, editor required title/language, and account password/email-change validation errors appear beside the field and focus it. Browser walks confirmed duplicate username, weak password, email-change rejection and publication validation, including 390 px mobile editor checks. An input label/name/autocomplete inventory covered public auth/search, profile, editor and root-comment forms. Comment/reply/edit/report forms now retain text after failed submission, prevent concurrent duplicate submission and require confirmation before anchor navigation or discarding dirty inline/dialog forms; six related live scenarios passed, including report accessibility at 320/1710 px. Silent DOM-fill submission is now verified in four browser projects and three account forms against the real local backend; direct native autofill/password-manager behavior and remaining per-form checks are still open. Reply/edit recovery now retains original targets and nested context after Back or same-user login, including moved/deleted targets, failed-context retry and explicit cross-tab logout; 209 frontend tests and all 72 local live journeys passed. Root comments and reopened reports now restore in account-scoped tab memory after Back or same-user login, with explicit/cross-tab logout purge; report targets stay isolated and unavailable-target rejection retains context. Local cache, 198 frontend tests and eight related live journeys cover this limited recovery scope. Root/reply/edit/report field validation now retains text, associates errors with the input and focuses after controls are enabled; 185 frontend tests and three related live journeys passed locally, including 320/1710 px report error accessibility. The later local suite passed 192 frontend tests and nine related live journeys; the `eca9298` gate failure was followed by all nine jobs passing on `8a5d31a`; the later `a9b3cc4` report gate failed on fixture ordering and departing-document diagnostics; the corrected source `e6858a0` passed all nine jobs; subsequent query/email/release corrections passed their own gates; partial-settings source `7381042` also passed its gate; editor hydration source `371dd1b` also passed its gate; catalog/player source `6eaaf25` also passed its gate; editor mutation source `6bcc3ef` failed two live cases; its corrected source `07d3e41` failed one WebKit page-error case after 82 live passes; native editor URL correction and new card/profile/shared-result source need their own gate.
- [ ] 8. BUTTONS AND CONTROLS — Partial: semantic button/link markup, focus and disabled states, destructive styling/confirmation, and 44px editor touch targets at 320/1710px were checked. Shared button hover/press feedback now changes visibly without mobile overflow; custom control states and form ownership need the remaining per-control sweep.
- [x] 9. DESTRUCTIVE ACTIONS — Verified before deployment: confirmed permanent Delete/Reset, authorization and repeat safety, account-deletion cancellation, and live Archive/Restore with guest 404/200 and reload persistence; permanent actions do not promise undo.
- [x] 10. SIGNUP — Verified before deployment: browser validation, password visibility and Enter, Mailpit verification and resend, duplicate and weak-password API behavior, expired and reused links.
- [x] 11. LOGIN — Verified before deployment: valid/invalid credentials, rate limit, safe return navigation, signed-in redirect, and session-error fallback.
- [x] 12. PASSWORD RESET — Verified before deployment: Mailpit delivery, configured HTTPS link, TTL, one-time use, credential change, and session revocation.
- [x] 13. LOGOUT — Verified before deployment: session/API revocation, browser Back and private deep link, and local recovery cleanup.
- [x] 14. AUTHORIZATION — Verified before deployment: direct admin/API and cross-account ID/role/delete/download probes, including the fixed old-share media leak.
- [x] 15. ONBOARDING — Verified before deployment: the current one-time post-verification/registration language dialog and confirmed skip persist; existing unconfigured accounts are not prompted while browsing. Live registration, settings persistence and responsive dialog journeys passed; multi-step progress is N/A because setup has one step.
- [x] 16. EMPTY STATES — Verified before deployment: zero-data feed/search, profile, notifications, comments, and editor states; teams, commerce, charts, and analytics-period screens are absent.
- [x] 17. SEARCH — Verified before deployment: input normalization, Unicode/literal matching, result counts and pagination, visible loading, debounced suggestions, Enter, combined filters, URL restore, and clear. Direct multi-tag URL loading and refresh now retain correct results.
- [x] 18. TABLES AND LISTS — Verified before deployment: card-list zero/one/many, pagination, filtered sorting, long/null content, mobile layout, and selected sort/tab states; tabular headers and list horizontal scrolling are N/A.
- [x] 19. FILE UPLOADS — Verified before deployment: successful/invalid/duplicate uploads, cancellation and retry, stage progress, owner access, normalization, and private local object storage; provider policy remains a rollout input.
- [x] 20. IMAGES — Verified before deployment: image descriptions for image-only cells, thumbnails, lazy loading, broken-image fallback, aspect ratio, and safe serving exercised in backend and browser.
- [ ] 21. RESPONSIVE DESIGN — Partial: 320–2560 px board/editor gate, mobile WebKit, landscape/short-height inspector, and simulated keyboard-sized modal passed; real address-bar, keyboard, and iPhone safe-area behavior still need device evidence.
- [x] 22. TOUCH UX — Verified before deployment: 44 px mobile touch targets, tap navigation/language/play/editor actions, optional drag alternatives, and no hover/tooltip-only critical controls.
- [x] 23. KEYBOARD UX — Verified before deployment: navigation, Enter/Space/Escape, visible focus, and cross-browser report-dialog focus trap/return.
- [ ] 24. ACCESSIBILITY — Partial: full-severity Axe and live modal checks passed, H1/grid/color-only issues fixed; heading hierarchy now passes. Three unnamed editor sliders gained explicit accessible names and values, confirmed in the browser tree. Discretionary ARIA, actual 200% zoom, and UI contrast remain.
- [ ] 25. COPY AND PLACEHOLDERS — Partial: placeholder inventory and product/auth names checked; legal operator copy and broader error-message exposure remain.
- [x] 26. LONG-CONTENT TORTURE TEST — Verified before deployment: account/title limits, 254-character email, long URL/multilingual comment, profile/card/cell wrapping, and 320/1710 px layout.
- [x] 27. DATES AND TIME — Verified before deployment: UTC storage and ISO timestamps, local display with timezone, DST/calendar boundaries, and database ordering by datetime; relative today/yesterday labels are not used.
- [x] 28. NUMBERS — Verified before deployment: bounded integer counts and percentages, invalid-number recovery guards, compact notation and decimal rounding; no currency capability in this release.
- [x] 29. LOCALIZATION / INTERNATIONALIZATION — Verified before deployment: English UI and email, explicit content languages, persisted language preferences and supported filter URLs, local date/number formats, plural labels, and RTL text direction. Catalog/search language pickers are intentionally removed by the 2026-10-03 instruction; no translated UI routes or currency feature.
- [x] 30. 404 HANDLING — Verified before deployment: unknown/legacy routes, malformed and deleted bingo IDs, private/missing resources, real SSR 404 status, explanation and Discover return path.
- [x] 31. GLOBAL / 500 ERROR HANDLING — Verified before deployment: route and root error boundaries, safe retry/navigation, logged 500, generic public response, and X-Request-ID correlation; external error tracking remains in section 63.
- [x] 32. OFFLINE / BAD NETWORK — Verified before deployment: offline draft recovery, slow-search loading, finite API/upload deadlines, actionable failures, retry/cancel, and progress-reset rollback with recovery.
- [ ] 33. BROWSER COMPATIBILITY — Partial: installed Chrome and Safari, Playwright Firefox, WebKit, and mobile emulation cover core flows; actual Edge and iOS/Android browser devices remain unverified.
- [ ] 34. PERFORMANCE — Partial: production bundles, request counts, N+1, gzip, cache policy, image/font assets, and layout shifts reviewed. Social API root/reply pages now have distinct-author/avatar/like query-growth regressions: 8 root-page and 6 reply-page queries at one and 24 items; a reply-parent N+1 was fixed. Target CDN choice and real-network/load budgets remain open.
- [x] 35. FONTS — Verified before deployment: UI uses system stacks; the worker ships Pango/Noto fallback and shaping for all 15 content languages plus emoji. Real PNG/PDF downloads were visually checked, with zero missing glyphs in native layout diagnostics and no line truncation.
- [ ] 36. SEO FOR PUBLIC PAGES — Partial: production-mode metadata, sitemap, robots, staging noindex, and slash redirects verified; heading hierarchy, URL policy, sitemap scale, and real HTTPS host remain.
- [ ] 37. SOCIAL SHARING — Partial: real HTML now emits absolute branded 1200×630 OG/Twitter images for catalog, bingo, profile, and shared result; external service previews and the final domain remain.
- [ ] 38. DOMAIN AND DNS — Partial: public smoke script is prepared; the actual domain, records, and propagation need target-environment evidence.
- [ ] 39. HTTPS / TLS — Partial: smoke script enforces HTTPS; certificate and edge configuration need target-environment evidence.
- [ ] 40. ENVIRONMENT VARIABLES — Partial: frontend image build/runtime origin contract, Django production origin consistency, and local-env isolation verified; real DB, storage, email, monitoring, and public origin values remain.
- [x] 41. SECRETS — Verified before deployment: complete-history Gitleaks, tracked-path and ignore rules, Docker build contexts, and client-bundle marker scan found no real secret; OAuth is absent.
- [ ] 42. DATABASE — Partial: fresh/existing-data migrations and isolated QA dump restore passed. Read-only inspection matched 31 tables, 47 indexes, 37 constraint types, uniqueness, FK targets and nullability. A disposable 10,000-board/20,000-revision/180,000-cell upgrade preserved counts and publication metadata; base query plans were measured. Model defaults/transaction coverage, joined/concurrent-load measurements, managed recovery and target deployment/rollback remain.
- [x] 43. DATA INTEGRITY — Verified before deployment: PostgreSQL concurrent likes/follows, versioned editor/progress conflicts, idempotent draft/publication/export/session/report/notification calls, soft-delete threads, reference-aware media and abandoned-job recovery passed; webhook duplication is N/A.
- [ ] 44. BACKUPS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 45. EMAILS — Partial: registration verification, password reset, email-change and security notices have production-origin links, branded subjects and plain-text bodies; messages that direct users to support now include the public support page. Local mail flow and expiry checks passed. Messages now show their stored UTC expiration; queued resets skip invalidated tokens. Fifteen new retry/exhaustion/expiry guards, 46 related account cases, all 234 local backend tests (plus one infrastructure-only skip) and three live email journeys passed. A real isolated QA SMTP outage produced a worker retry, delivery after restoration and a successful API reset; the temporary account was removed. Sender-domain authentication, provider delivery/rate limits, a monitored support address and real-device inbox rendering still require the chosen domain and email service.
- [x] 46. NOTIFICATIONS — Verified before deployment: all activity types and deduplication, recipient-scoped unread/read/Mark All Read and timestamps, live link navigation/reload, and real deleted/private target denial passed. There is no separate Mark Unread action.
- — 47. OAUTH / SOCIAL LOGIN — N/A for current release: capability absent in source inventory.
- — 48. PAYMENTS — N/A for current release: capability absent in source inventory.
- — 49. WEBHOOKS — N/A for current release: capability absent in source inventory.
- [ ] 50. SECURITY HEADERS — Partial: live QA responses and production CSP policy cover all listed headers except public HTTPS HSTS behavior, which needs the target edge.
- [ ] 51. COOKIES — Partial: Secure production settings, HttpOnly session, SameSite, logout revocation, and CSRF-only JS access verified; settle final expiry and inspect host/path on the real origin.
- [x] 52. BASIC SECURITY ABUSE TESTS — Verified before deployment: actual published HTML/script/image-handler/JavaScript/SQL-looking text remains literal; search returns only its literal match; external return URLs are rejected. Malicious path/HTML filenames cannot change the generated object location. Oversized, decimal or negative board sizes and unknown languages return 400; negative IDs return 404. Malformed bytes are safe, and cross-user UUID/rate/brute-force tests pass. This is bounded abuse testing, not a penetration-test certification.
- [x] 53. RATE LIMITING — Verified before deployment: login/signup/verification/reset/email-change/upload scopes reject repeated invalid requests; search/catalog/feed/tag/author quotas work for guests and signed-in callers, without resetting on query changes. HTTP 429 retains Retry-After and understandable delay text; shares/exports preserve idempotent retries. AI endpoints are absent; target quotas remain configurable.
- — 54. AI/LLM FEATURES — N/A for current release: capability absent in source inventory.
- [ ] 55. PRIVACY — Partial: collection/analytics disclosures, account export and scheduled deletion, and query-free application logging were reviewed and exercised. Final policy/terms, consent obligations, historical recovery links and token behavior across target telemetry, and actual third-party processor inventory still require review against the chosen operator, jurisdiction, and production providers.
- [x] 56. ACCOUNT SETTINGS — Verified before deployment: names, email change/reverification, settings password change/recovery, logout/session revocation, deletion/cancel/anonymization, avatar upload/remove/reload, and language/privacy/notification persistence; separate timezone and logout-all controls are absent.
- — 57. TEAMS / ORGANIZATIONS — N/A for current release: capability absent in source inventory.
- [ ] 58. BROWSER STORAGE — Partial: comment recovery added; version/revision and owner checks, corrupt/stale/unavailable storage, non-persistent browser contexts, and real two-tab logout followed by a different account passed; no credential is stored in browser storage. Root comment drafts now use bounded account/board-scoped tab memory with local/cross-tab sign-out purge and generation protection; the sender-storage-blocked BroadcastChannel fallback has live evidence. Simultaneous unavailability of both cross-tab mechanisms remains unverified.
- [ ] 59. CACHE — Partial: dynamic HTML/API no-store policy, immutable hashed assets, no service worker, and logout isolation checked; version-swap and CDN invalidation require a target release path.
- [x] 60. SERVICE WORKER / PWA — Verified before deployment: no PWA/manifest/worker/install capability in source; live browser had zero service workers and CacheStorage entries. Conditional PWA bullets are N/A; there is no previously deployed origin.
- [ ] 61. ANALYTICS — Partial: play completion and other core interactions are recorded without free-text search/filter values after a client/server privacy fix and backfill; categorical page/CTA and server signup/login counts plus a mature activation/return report are now implemented; exact guest-to-signup conversion, target isolation and real observations remain.
- [ ] 62. PRODUCT METRICS — Partial: registration counts and core board/play actions are queryable from first-party records; the read-only cohort report measures estimated arrivals, mature signup-to-activation/return and their drop-offs; exact guest conversion and real production data remain unavailable.
- [ ] 63. ERROR TRACKING — Partial: browser boundaries, uncaught errors, unhandled promises and unexpected API failures now send bounded same-origin diagnostics through the CSRF-protected, throttled backend collector. Chromium/mobile/Firefox/WebKit scenarios and a live 204 response passed; installed-SDK transport proves capture and filtering with configured synthetic environment/release. Loaded frontend bundles now carry their own immutable release SHA; installed-SDK, four-browser and production-image probes verify old-client/receiving-backend separation, legacy unknown identity and image relabel rejection. Source maps are intentionally absent from public assets, with provider upload explicitly not configured or required for launch (section 81/runbook). Actual provider delivery/grouping, target environment/release configuration and alert delivery remain open.
- [x] 64. LOGGING — Verified before deployment: application/Celery/Gunicorn use projected safe JSON, normalized route templates and exception locations without arbitrary messages/bodies/args; SDK and proxy fault probes exclude marked values. Target edge/provider policies remain rollout inputs.
- [ ] 65. MONITORING — Partial: QA proves proxy/frontend, API/DB/cache readiness, and Beat heartbeat endpoints; Docker healthchecks cover processes. External uptime, queue/worker, capacity, error-rate, and latency monitors need a production host and provider.
- [ ] 66. ALERTS — Partial: the runbook defines pages for availability, errors, database, worker, backup, and capacity, but no destination or delivered alert is configured. Payment webhook failure is N/A; email and object-storage dependency alerts still need a real provider.
- [ ] 67. HEALTH ENDPOINT — Partial: live, readiness, database, migration, cache, and Beat checks respond on QA without secrets; target storage/email and external monitor coverage remain.
- [ ] 68. CRON / SCHEDULED JOBS — Partial: UTC schedule and QA Beat heartbeat observed; structured task retry/failure logging is configured. PostgreSQL advisory locks and bounded retries now prove local overlap/duplicate safety; the actual singleton deployment and alerts need a target platform.
- [ ] 69. QUEUES / WORKERS — Partial: QA worker/Redis healthy on a durable default queue; media/export retries and duplicate guards exist, and trending work is bounded; local Redis/worker restart replay, stalled-claim recovery and terminal storage failures passed; the actual production queue/platform and delivered alerts remain.
- [x] 70. PRODUCTION BUILD — Verified before deployment: current optimized Next build/start, SSR/static routes, dynamic route assets and browser console passed on the production candidate; actual domain/provider values remain rollout inputs.
- [x] 71. DEPENDENCIES — Verified before deployment: committed npm and Python 3.13 production/development locks, clean installs and builds, runtime version alignment, local ARM64 native imports, x86_64 CI production image and real worker PNG/PDF export pass. The full CI gate for that source failed in an unrelated mobile WebKit interaction, which is tracked separately.
- [ ] 72. CI/CD — Partial: local evidence recorded; review remaining original bullets.
- [x] 73. TESTS — Verified before deployment: 191 PostgreSQL tests, 150 frontend tests and 54 live scenarios passed on `cb812e2`, covering auth, authorization, editor/play/save, deletion, important APIs and calculations; payments are absent. Exact-head CI is still required for the final artifact.
- ↗ 74. PRODUCTION SMOKE TEST — Deployment-only: read-only script prepared; supply the real HTTPS origin and a known published board, then run it during rollout.
- [x] 75. BROWSER CONSOLE — Verified before deployment: installed Chrome inspected 16 public routes at 320/1710 px and three signed-in routes on the current production build, with zero console errors/warnings or failed assets; target-origin smoke remains part of rollout.
- [ ] 76. NETWORK PANEL — Partial: local evidence recorded; review remaining original bullets.
- [x] 77. HTTP STATUS CODES — Verified before deployment: the root's intentional 307 redirect resolves to canonical Discover HTTP 200; direct valid and missing pages return 200/404, trailing-slash normalization returns 308 with the query preserved, a guest on protected API routes receives 401 with a Session challenge, and authenticated forbidden or CSRF-invalid requests still receive 403. Real-domain edge status handling remains for rollout.
- [ ] 78. REDIRECTS — Partial: login/logout, root, and trailing-slash redirects work with preserved query and no loop; public HTTP→HTTPS, host alias, and legacy URL policy need a domain.
- [x] 79. STATIC ASSETS — Verified before deployment: production candidate icon/social/static assets, normalized images, protected ZIP downloads, branding and case-sensitive routing were observed; external fonts, PWA manifest and standalone static documents are absent.
- [x] 80. PUBLIC FILE EXPOSURE — Verified before deployment: current production server returned 404 for environment/Git, SQL backup, SQLite, private key, log and internal Next server probes; release image/context guards exclude sensitive files. Target edge/bucket smoke remains a rollout gate.
- [x] 81. SOURCE MAPS — Verified before deployment: private map policy, production-image file inspection, HTTP probes, and CI guard.
- [ ] 82. API READINESS — Partial: catalog search lengths, language choices and tag count/length are bounded; malformed ownership/sort filters return 400, while guest `mine=true` returns 401. Notifications validate `unread` and expose only supported list filters in OpenAPI. Auth, access, schema and common errors are covered by the current suite. An endpoint-by-endpoint matrix for timeouts, pagination, request limits, logging and idempotency remains.
- [ ] 83. CORS — Partial: QA preflight allows its configured origin with credentials and denies an outside origin; production rejects wildcard, HTTP, and local CSRF/CORS origins; staging target remains unspecified.
- [x] 84. FEATURE FLAGS — Verified before deployment: complete runtime feature inventory, development-only Agentation, production debug/seed rejection and server staff permissions; remote flags are absent and no unfinished feature CTA is exposed.
- [x] 85. DEBUG ARTIFACTS — Verified before deployment: runtime source and production build reviewed for console/debug/TODO/mock/fake-auth/seed/credential artifacts; retained local defaults are guarded development/configuration values rejected by production checks.
- [ ] 86. TEST / DEMO ACCOUNTS — Partial: deterministic `.test` fixtures and elevated E2E moderator cannot be created by the seed command under production settings; verify the target database has none and is isolated from staging. Payments are absent.
- [ ] 87. ADMIN PANEL — Partial: Django staff permissions, moderation audit, search/pagination, hard-delete guards, and confirmation for bounded moderation actions verified; external staff gateway remains.
- [ ] 88. SUPPORT — Partial: local evidence recorded; review remaining original bullets.
- [ ] 89. LEGAL / BUSINESS FOOTER — Partial: Privacy, Terms, Cookies, and current-year footer verified; a private contact and real operator/legal identity still need user-provided details and review.
- [x] 90. FOOTER — Verified before deployment: current-year branded footer, five working internal links, contact destination page, intentional cookies anchor, responsive layout, and no broken placeholders; official social accounts are not configured for this release.
- [x] 91. PAGE METADATA — Verified before deployment: production-mode public route heads expose title, description, canonical, Open Graph/Twitter URLs and images, and favicon links at the configured origin.
- [ ] 92. FAVICON SET — Partial: ICO, SVG browser icon, and 180px Apple touch icon return 200 and appear in page head; light/dark browser chrome still needs a visual check. PWA is absent.
- [x] 93. SCROLL BEHAVIOR — Verified before deployment: route top, browser Back, modal close, horizontal overflow, and sticky-header anchor behavior checked at mobile and desktop widths. Removed global smooth scrolling after a mobile WebKit tap missed a moving checkbox; the corrected language flow passed 20 repeated touch runs and the full live regression.
- [x] 94. MODALS — Verified before deployment: report dialog X, Cancel, Escape, backdrop, focus containment, background scroll lock, and 320px-high viewport; there is no destructive modal action.
- [x] 95. DROPDOWNS / POPOVERS — Verified before deployment: language disclosures and download options open/close with touch and keyboard, remain unclipped at 320–1710px, and stay anchored on scroll; popup targets meet 44px.
- [x] 96. Z-INDEX / OVERLAY STACK — Verified before deployment: modal top layer blocks the sticky header and restores it on close; download popup remains bounded below the header, mobile inspector layers deliberately; no custom toast, tooltip, or date picker layers exist.
- — 97. TOASTS / TRANSIENT FEEDBACK — N/A for current release: source inventory found no toast component; action messages are persistent inline status/alert regions, assessed in section 98.
- [x] 98. ACTION FEEDBACK — Verified before deployment: editor save and upload stages/failures, publication/report submission, and account deletion schedule/cancel expose pending, success, and error states; invite and payment actions are absent.
- [x] 99. REFRESH TEST — Verified before deployment: editor state, recovery/password-reset routes, nested bingo/profile routes, and shared-result links recover after reload; dashboard, checkout, and OAuth callback do not exist.
- [x] 100. OPEN-IN-NEW-TAB TEST — Verified before deployment: independent tabs loaded public board, shared result, profile, Explore, recovery, and Create routes with server data and no prerequisite route memory.
- [x] 101. MULTIPLE TABS — Verified before deployment: two-tab logout/login propagation, draft version conflict and explicit resolution, fresh server state after reload, and concurrent duplicate likes were exercised against the QA stack; token refresh is N/A because authentication uses Django sessions.
- [x] 102. SESSION EXPIRATION — Verified before deployment: concurrent authentication failures trigger one session recheck; editor and play flows explain expiry, preserve unsaved progress, and restore the intended route after login.
- [ ] 103. VERSION / DEPLOYMENT COMPATIBILITY — Partial: local evidence recorded; review remaining original bullets.
- [ ] 104. ROLLBACK — Partial: additive migrations and an existing-data downgrade/upgrade rehearsal support backward compatibility; no remote feature flags exist. Previous image/config retention and an executable rollback command depend on the chosen production platform and have not been proven.
- [ ] 105. FINAL EXECUTION SEQUENCE — Partial: local user and release evidence recorded; `cb812e2` passed all nine CI jobs, including 54 full-stack flows, browser smoke and both production images. One static WebKit smoke assertion passed on retry after a transient duplicate loading/page selector match; its test selector is being narrowed. Remaining local checklist work and the target deployment sequence remain open.

## Deployment handoff, separate from predeployment completion

The final deployment must supply the actual domain/DNS/TLS edge, production
secrets and managed services, monitored support and transactional email,
operator-approved legal identity, observability and alerts, off-site restore,
registry image digests, and a tested rollback path. Capture these in the
[deployment runbook](production-deployment.md) as concrete configuration and
repeatable commands before declaring the repository ready to ship.

The public hostname, live TLS chain, third-party delivery, production data
recovery, and external network behavior cannot be truthfully observed in a
local stack. Automate a short post-deployment smoke and rollback gate for those
facts; it should be a release safety check, not a second product-discovery
phase. The current PR is a draft until the predeployment checklist is complete
and the handoff values are supplied.
