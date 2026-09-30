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

Snapshot for 2026-09-30: **48 verified**, **50 partial**, **0 awaiting itemized review**, **6 N/A**, **1 deployment-only**.
These counts describe predeployment evidence, not a readiness percentage. The
release cannot be considered ready while applicable predeployment bullets have
unresolved failures or missing evidence.

## Repository review map

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

- [ ] 1. BASIC LAUNCH DETAILS — Partial: guest Create path, status codes, assets, and session behavior recorded; review remaining bullets.
- [ ] 2. FIRST-SCREEN / PRODUCT CLARITY — Partial: Discover mobile/desktop first screen and its two primary actions walked; continue copy and content review.
- [ ] 3. NAVIGATION — Partial: Discover → Explore and Discover → Create plus Back verified; continue Forward, deep links, and menus.
- [ ] 4. UI STATES — Partial: first load, loaded/empty/error, offline/retry, authorization, and expired-session journeys were observed in representative routes; partial-data behavior and a component-by-component sweep remain.
- [ ] 5. LOADING UX — Partial: page/form pending states, editor save and upload status, long-running account export polling, and completion feedback were exercised; duplicate submission coverage, layout stability, and byte-level large-upload progress still need an itemized sweep. Skeletons are not used in this release.
- [x] 6. ERROR HANDLING — Verified before deployment: relevant 400/401/403/404/409/413/422/429/500 and gateway/network/timeout cases have safe human-readable feedback, retained work and appropriate retry; proxy HTML and parser/exception internals stay out of the interface.
- [ ] 7. FORMS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 8. BUTTONS AND CONTROLS — Partial: semantic button/link markup, focus and disabled states, destructive styling/confirmation, and 44px editor touch targets at 320/1710px were checked; hover/active/loading states and form ownership need the remaining per-control sweep.
- [x] 9. DESTRUCTIVE ACTIONS — Verified before deployment: confirmed permanent Delete/Reset, authorization and repeat safety, account-deletion cancellation, and live Archive/Restore with guest 404/200 and reload persistence; permanent actions do not promise undo.
- [x] 10. SIGNUP — Verified before deployment: browser validation, password visibility and Enter, Mailpit verification and resend, duplicate and weak-password API behavior, expired and reused links.
- [x] 11. LOGIN — Verified before deployment: valid/invalid credentials, rate limit, safe return navigation, signed-in redirect, and session-error fallback.
- [x] 12. PASSWORD RESET — Verified before deployment: Mailpit delivery, configured HTTPS link, TTL, one-time use, credential change, and session revocation.
- [x] 13. LOGOUT — Verified before deployment: session/API revocation, browser Back and private deep link, and local recovery cleanup.
- [x] 14. AUTHORIZATION — Verified before deployment: direct admin/API and cross-account ID/role/delete/download probes, including the fixed old-share media leak.
- [x] 15. ONBOARDING — Verified before deployment: first-login language step and skip persist, helpful first actions and profile empty states, responsive browser journey; multi-step progress is N/A because setup has one step.
- [x] 16. EMPTY STATES — Verified before deployment: zero-data feed/search, profile, notifications, comments, and editor states; teams, commerce, charts, and analytics-period screens are absent.
- [x] 17. SEARCH — Verified before deployment: input normalization, Unicode/literal matching, result counts and pagination, visible loading, debounced suggestions, Enter, combined filters, URL restore, and clear.
- [x] 18. TABLES AND LISTS — Verified before deployment: card-list zero/one/many, pagination, filtered sorting, long/null content, mobile layout, and selected sort/tab states; tabular headers and list horizontal scrolling are N/A.
- [x] 19. FILE UPLOADS — Verified before deployment: successful/invalid/duplicate uploads, cancellation and retry, stage progress, owner access, normalization, and private local object storage; provider policy remains a rollout input.
- [x] 20. IMAGES — Verified before deployment: image descriptions for image-only cells, thumbnails, lazy loading, broken-image fallback, aspect ratio, and safe serving exercised in backend and browser.
- [ ] 21. RESPONSIVE DESIGN — Partial: 320–2560 px board/editor gate, mobile WebKit, landscape/short-height inspector, and simulated keyboard-sized modal passed; real address-bar, keyboard, and iPhone safe-area behavior still need device evidence.
- [x] 22. TOUCH UX — Verified before deployment: 44 px mobile touch targets, tap navigation/language/play/editor actions, optional drag alternatives, and no hover/tooltip-only critical controls.
- [x] 23. KEYBOARD UX — Verified before deployment: navigation, Enter/Space/Escape, visible focus, and cross-browser report-dialog focus trap/return.
- [ ] 24. ACCESSIBILITY — Partial: full-severity Axe and live modal checks passed, H1/grid/color-only issues fixed; heading hierarchy now passes; discretionary ARIA, actual 200% zoom, and UI contrast remain.
- [ ] 25. COPY AND PLACEHOLDERS — Partial: placeholder inventory and product/auth names checked; legal operator copy and broader error-message exposure remain.
- [x] 26. LONG-CONTENT TORTURE TEST — Verified before deployment: account/title limits, 254-character email, long URL/multilingual comment, profile/card/cell wrapping, and 320/1710 px layout.
- [x] 27. DATES AND TIME — Verified before deployment: UTC storage and ISO timestamps, local display with timezone, DST/calendar boundaries, and database ordering by datetime; relative today/yesterday labels are not used.
- [x] 28. NUMBERS — Verified before deployment: bounded integer counts and percentages, invalid-number recovery guards, compact notation and decimal rounding; no currency capability in this release.
- [x] 29. LOCALIZATION / INTERNATIONALIZATION — Verified before deployment: English UI and email, explicit content languages, language filters/preferences and URLs, local date/number formats, plural labels, and RTL text direction; no translated UI routes or currency feature.
- [x] 30. 404 HANDLING — Verified before deployment: unknown/legacy routes, malformed and deleted bingo IDs, private/missing resources, real SSR 404 status, explanation and Discover return path.
- [x] 31. GLOBAL / 500 ERROR HANDLING — Verified before deployment: route and root error boundaries, safe retry/navigation, logged 500, generic public response, and X-Request-ID correlation; external error tracking remains in section 63.
- [x] 32. OFFLINE / BAD NETWORK — Verified before deployment: offline draft recovery, slow-search loading, finite API/upload deadlines, actionable failures, retry/cancel, and progress-reset rollback with recovery.
- [ ] 33. BROWSER COMPATIBILITY — Partial: installed Chrome and Safari, Playwright Firefox, WebKit, and mobile emulation cover core flows; actual Edge and iOS/Android browser devices remain unverified.
- [ ] 34. PERFORMANCE — Partial: production bundles, request counts, N+1, gzip, cache policy, image/font assets, and layout shifts reviewed; target CDN choice and real-network/load budgets remain open.
- [x] 35. FONTS — Verified before deployment: UI uses system stacks; the worker ships Pango/Noto fallback and shaping for all 15 content languages plus emoji. Real PNG/PDF downloads were visually checked, with zero missing glyphs in native layout diagnostics and no line truncation.
- [ ] 36. SEO FOR PUBLIC PAGES — Partial: production-mode metadata, sitemap, robots, staging noindex, and slash redirects verified; heading hierarchy, URL policy, sitemap scale, and real HTTPS host remain.
- [ ] 37. SOCIAL SHARING — Partial: real HTML now emits absolute branded 1200×630 OG/Twitter images for catalog, bingo, profile, and shared result; external service previews and the final domain remain.
- [ ] 38. DOMAIN AND DNS — Partial: public smoke script is prepared; the actual domain, records, and propagation need target-environment evidence.
- [ ] 39. HTTPS / TLS — Partial: smoke script enforces HTTPS; certificate and edge configuration need target-environment evidence.
- [ ] 40. ENVIRONMENT VARIABLES — Partial: frontend image build/runtime origin contract, Django production origin consistency, and local-env isolation verified; real DB, storage, email, monitoring, and public origin values remain.
- [x] 41. SECRETS — Verified before deployment: complete-history Gitleaks, tracked-path and ignore rules, Docker build contexts, and client-bundle marker scan found no real secret; OAuth is absent.
- [ ] 42. DATABASE — Partial: fresh and existing-data migrations, author/publication preservation, and isolated QA dump restore passed; managed backups, schema/index audit, scale, and release rollback drill remain.
- [x] 43. DATA INTEGRITY — Verified before deployment: PostgreSQL concurrent likes/follows, versioned editor/progress conflicts, idempotent draft/publication/export/session/report/notification calls, soft-delete threads, reference-aware media and abandoned-job recovery passed; webhook duplication is N/A.
- [ ] 44. BACKUPS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 45. EMAILS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 46. NOTIFICATIONS — Partial: local evidence recorded; review remaining original bullets.
- — 47. OAUTH / SOCIAL LOGIN — N/A for current release: capability absent in source inventory.
- — 48. PAYMENTS — N/A for current release: capability absent in source inventory.
- — 49. WEBHOOKS — N/A for current release: capability absent in source inventory.
- [ ] 50. SECURITY HEADERS — Partial: live QA responses and production CSP policy cover all listed headers except public HTTPS HSTS behavior, which needs the target edge.
- [ ] 51. COOKIES — Partial: Secure production settings, HttpOnly session, SameSite, logout revocation, and CSRF-only JS access verified; settle final expiry and inspect host/path on the real origin.
- [ ] 52. BASIC SECURITY ABUSE TESTS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 53. RATE LIMITING — Partial: local evidence recorded; review remaining original bullets.
- — 54. AI/LLM FEATURES — N/A for current release: capability absent in source inventory.
- [ ] 55. PRIVACY — Partial: collection/analytics disclosures, account export and scheduled deletion, and query-free application logging were reviewed and exercised. Final policy/terms, consent obligations, historical recovery links and token behavior across target telemetry, and actual third-party processor inventory still require review against the chosen operator, jurisdiction, and production providers.
- [x] 56. ACCOUNT SETTINGS — Verified before deployment: names, email change/reverification, settings password change/recovery, logout/session revocation, deletion/cancel/anonymization, avatar upload/remove/reload, and language/privacy/notification persistence; separate timezone and logout-all controls are absent.
- — 57. TEAMS / ORGANIZATIONS — N/A for current release: capability absent in source inventory.
- [x] 58. BROWSER STORAGE — Verified before deployment: version/revision and owner checks, corrupt/stale/unavailable storage, non-persistent browser contexts, and real two-tab logout followed by a different account passed; no credential is stored in browser storage.
- [ ] 59. CACHE — Partial: dynamic HTML/API no-store policy, immutable hashed assets, no service worker, and logout isolation checked; version-swap and CDN invalidation require a target release path.
- [x] 60. SERVICE WORKER / PWA — Verified before deployment: no PWA/manifest/worker/install capability in source; live browser had zero service workers and CacheStorage entries. Conditional PWA bullets are N/A; there is no previously deployed origin.
- [ ] 61. ANALYTICS — Partial: play completion and other core interactions are recorded without free-text search/filter values after a client/server privacy fix and backfill; categorical page/CTA and server signup/login counts plus a mature activation/return report are now implemented; exact guest-to-signup conversion, target isolation and real observations remain.
- [ ] 62. PRODUCT METRICS — Partial: registration counts and core board/play actions are queryable from first-party records; the read-only cohort report measures estimated arrivals, mature signup-to-activation/return and their drop-offs; exact guest conversion and real production data remain unavailable.
- [ ] 63. ERROR TRACKING — Partial: Django can send errors to Sentry with environment/release metadata and default PII disabled; installed-SDK in-memory delivery proves local filtering, but no production DSN, frontend/unhandled-promise integration, or private source-map upload exists yet. API failures have structured server logs but no verified alerting pipeline.
- [x] 64. LOGGING — Verified before deployment: application/Celery/Gunicorn use projected safe JSON, normalized route templates and exception locations without arbitrary messages/bodies/args; SDK and proxy fault probes exclude marked values. Target edge/provider policies remain rollout inputs.
- [ ] 65. MONITORING — Partial: QA proves proxy/frontend, API/DB/cache readiness, and Beat heartbeat endpoints; Docker healthchecks cover processes. External uptime, queue/worker, capacity, error-rate, and latency monitors need a production host and provider.
- [ ] 66. ALERTS — Partial: the runbook defines pages for availability, errors, database, worker, backup, and capacity, but no destination or delivered alert is configured. Payment webhook failure is N/A; email and object-storage dependency alerts still need a real provider.
- [ ] 67. HEALTH ENDPOINT — Partial: live, readiness, database, migration, cache, and Beat checks respond on QA without secrets; target storage/email and external monitor coverage remain.
- [ ] 68. CRON / SCHEDULED JOBS — Partial: UTC schedule and QA Beat heartbeat observed; structured task retry/failure logging is configured. PostgreSQL advisory locks and bounded retries now prove local overlap/duplicate safety; the actual singleton deployment and alerts need a target platform.
- [ ] 69. QUEUES / WORKERS — Partial: QA worker/Redis healthy on a durable default queue; media/export retries and duplicate guards exist, and trending work is bounded; local Redis/worker restart replay, stalled-claim recovery and terminal storage failures passed; the actual production queue/platform and delivered alerts remain.
- [x] 70. PRODUCTION BUILD — Verified before deployment: current optimized Next build/start, SSR/static routes, dynamic route assets and browser console passed on the production candidate; actual domain/provider values remain rollout inputs.
- [ ] 71. DEPENDENCIES — Partial: local evidence recorded; review remaining original bullets.
- [ ] 72. CI/CD — Partial: local evidence recorded; review remaining original bullets.
- [x] 73. TESTS — Verified before deployment: 169 PostgreSQL tests plus 126 frontend tests and 52 live scenarios cover auth, authorization, editor/play/save, deletion, important APIs and calculations; payments are absent. Exact-head CI is still required for the final artifact.
- ↗ 74. PRODUCTION SMOKE TEST — Deployment-only: read-only script prepared; supply the real HTTPS origin and a known published board, then run it during rollout.
- [x] 75. BROWSER CONSOLE — Verified before deployment: installed Chrome inspected 16 public routes at 320/1710 px and three signed-in routes on the current production build, with zero console errors/warnings or failed assets; target-origin smoke remains part of rollout.
- [ ] 76. NETWORK PANEL — Partial: local evidence recorded; review remaining original bullets.
- [ ] 77. HTTP STATUS CODES — Partial: local evidence recorded; review remaining original bullets.
- [ ] 78. REDIRECTS — Partial: login/logout, root, and trailing-slash redirects work with preserved query and no loop; public HTTP→HTTPS, host alias, and legacy URL policy need a domain.
- [x] 79. STATIC ASSETS — Verified before deployment: production candidate icon/social/static assets, normalized images, protected ZIP downloads, branding and case-sensitive routing were observed; external fonts, PWA manifest and standalone static documents are absent.
- [x] 80. PUBLIC FILE EXPOSURE — Verified before deployment: current production server returned 404 for environment/Git, SQL backup, SQLite, private key, log and internal Next server probes; release image/context guards exclude sensitive files. Target edge/bucket smoke remains a rollout gate.
- [x] 81. SOURCE MAPS — Verified before deployment: private map policy, production-image file inspection, HTTP probes, and CI guard.
- [ ] 82. API READINESS — Partial: local evidence recorded; review remaining original bullets.
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
- [x] 93. SCROLL BEHAVIOR — Verified before deployment: route top, browser Back, modal close, horizontal overflow, and sticky-header anchor behavior checked at mobile and desktop widths.
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
- [ ] 105. FINAL EXECUTION SEQUENCE — Partial: local evidence recorded; review remaining original bullets.

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
