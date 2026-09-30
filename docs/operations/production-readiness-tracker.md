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

Snapshot for 2026-09-30: **12 verified**, **49 partial**, **38 awaiting itemized review**, **5 N/A**, **1 deployment-only**.
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
- [ ] 4. UI STATES — Review pending: map original bullets to repository and runtime evidence.
- [ ] 5. LOADING UX — Review pending: map original bullets to repository and runtime evidence.
- [ ] 6. ERROR HANDLING — Partial: local evidence recorded; review remaining original bullets.
- [ ] 7. FORMS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 8. BUTTONS AND CONTROLS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 9. DESTRUCTIVE ACTIONS — Review pending: map original bullets to repository and runtime evidence.
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
- [ ] 21. RESPONSIVE DESIGN — Partial: Chromium and mobile WebKit interactions recorded; continue remaining original bullets.
- [ ] 22. TOUCH UX — Partial: Chromium and mobile WebKit interactions recorded; continue remaining original bullets.
- [ ] 23. KEYBOARD UX — Partial: Chromium and mobile WebKit interactions recorded; continue remaining original bullets.
- [ ] 24. ACCESSIBILITY — Partial: local evidence recorded; review remaining original bullets.
- [ ] 25. COPY AND PLACEHOLDERS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 26. LONG-CONTENT TORTURE TEST — Partial: local evidence recorded; review remaining original bullets.
- [ ] 27. DATES AND TIME — Review pending: map original bullets to repository and runtime evidence.
- [ ] 28. NUMBERS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 29. LOCALIZATION / INTERNATIONALIZATION — Partial: local evidence recorded; review remaining original bullets.
- [ ] 30. 404 HANDLING — Partial: local evidence recorded; review remaining original bullets.
- [ ] 31. GLOBAL / 500 ERROR HANDLING — Partial: local evidence recorded; review remaining original bullets.
- [ ] 32. OFFLINE / BAD NETWORK — Partial: local evidence recorded; review remaining original bullets.
- [ ] 33. BROWSER COMPATIBILITY — Partial: local evidence recorded; review remaining original bullets.
- [ ] 34. PERFORMANCE — Review pending: map original bullets to repository and runtime evidence.
- [ ] 35. FONTS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 36. SEO FOR PUBLIC PAGES — Partial: local evidence recorded; review remaining original bullets.
- [ ] 37. SOCIAL SHARING — Review pending: map original bullets to repository and runtime evidence.
- [ ] 38. DOMAIN AND DNS — Partial: public smoke script is prepared; the actual domain, records, and propagation need target-environment evidence.
- [ ] 39. HTTPS / TLS — Partial: smoke script enforces HTTPS; certificate and edge configuration need target-environment evidence.
- [ ] 40. ENVIRONMENT VARIABLES — Partial: local evidence recorded; review remaining original bullets.
- [ ] 41. SECRETS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 42. DATABASE — Review pending: map original bullets to repository and runtime evidence.
- [ ] 43. DATA INTEGRITY — Partial: local evidence recorded; review remaining original bullets.
- [ ] 44. BACKUPS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 45. EMAILS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 46. NOTIFICATIONS — Partial: local evidence recorded; review remaining original bullets.
- — 47. OAUTH / SOCIAL LOGIN — N/A for current release: capability absent in source inventory.
- — 48. PAYMENTS — N/A for current release: capability absent in source inventory.
- — 49. WEBHOOKS — N/A for current release: capability absent in source inventory.
- [ ] 50. SECURITY HEADERS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 51. COOKIES — Review pending: map original bullets to repository and runtime evidence.
- [ ] 52. BASIC SECURITY ABUSE TESTS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 53. RATE LIMITING — Partial: local evidence recorded; review remaining original bullets.
- — 54. AI/LLM FEATURES — N/A for current release: capability absent in source inventory.
- [ ] 55. PRIVACY — Review pending: map original bullets to repository and runtime evidence.
- [ ] 56. ACCOUNT SETTINGS — Partial: local evidence recorded; review remaining original bullets.
- — 57. TEAMS / ORGANIZATIONS — N/A for current release: capability absent in source inventory.
- [ ] 58. BROWSER STORAGE — Partial: local evidence recorded; review remaining original bullets.
- [ ] 59. CACHE — Review pending: map original bullets to repository and runtime evidence.
- [ ] 60. SERVICE WORKER / PWA — Partial: local evidence recorded; review remaining original bullets.
- [ ] 61. ANALYTICS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 62. PRODUCT METRICS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 63. ERROR TRACKING — Review pending: map original bullets to repository and runtime evidence.
- [ ] 64. LOGGING — Review pending: map original bullets to repository and runtime evidence.
- [ ] 65. MONITORING — Review pending: map original bullets to repository and runtime evidence.
- [ ] 66. ALERTS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 67. HEALTH ENDPOINT — Review pending: map original bullets to repository and runtime evidence.
- [ ] 68. CRON / SCHEDULED JOBS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 69. QUEUES / WORKERS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 70. PRODUCTION BUILD — Partial: local evidence recorded; review remaining original bullets.
- [ ] 71. DEPENDENCIES — Partial: local evidence recorded; review remaining original bullets.
- [ ] 72. CI/CD — Partial: local evidence recorded; review remaining original bullets.
- [ ] 73. TESTS — Partial: local evidence recorded; review remaining original bullets.
- ↗ 74. PRODUCTION SMOKE TEST — Deployment-only: read-only script prepared; supply the real HTTPS origin and a known published board, then run it during rollout.
- [ ] 75. BROWSER CONSOLE — Partial: local evidence recorded; review remaining original bullets.
- [ ] 76. NETWORK PANEL — Partial: local evidence recorded; review remaining original bullets.
- [ ] 77. HTTP STATUS CODES — Partial: local evidence recorded; review remaining original bullets.
- [ ] 78. REDIRECTS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 79. STATIC ASSETS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 80. PUBLIC FILE EXPOSURE — Partial: local evidence recorded; review remaining original bullets.
- [x] 81. SOURCE MAPS — Verified before deployment: private map policy, production-image file inspection, HTTP probes, and CI guard.
- [ ] 82. API READINESS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 83. CORS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 84. FEATURE FLAGS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 85. DEBUG ARTIFACTS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 86. TEST / DEMO ACCOUNTS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 87. ADMIN PANEL — Review pending: map original bullets to repository and runtime evidence.
- [ ] 88. SUPPORT — Partial: local evidence recorded; review remaining original bullets.
- [ ] 89. LEGAL / BUSINESS FOOTER — Review pending: map original bullets to repository and runtime evidence.
- [ ] 90. FOOTER — Review pending: map original bullets to repository and runtime evidence.
- [ ] 91. PAGE METADATA — Partial: local evidence recorded; review remaining original bullets.
- [ ] 92. FAVICON SET — Review pending: map original bullets to repository and runtime evidence.
- [ ] 93. SCROLL BEHAVIOR — Review pending: map original bullets to repository and runtime evidence.
- [ ] 94. MODALS — Review pending: map original bullets to repository and runtime evidence.
- [ ] 95. DROPDOWNS / POPOVERS — Partial: Chromium and mobile WebKit interactions recorded; continue remaining original bullets.
- [ ] 96. Z-INDEX / OVERLAY STACK — Review pending: map original bullets to repository and runtime evidence.
- [ ] 97. TOASTS / TRANSIENT FEEDBACK — Review pending: map original bullets to repository and runtime evidence.
- [ ] 98. ACTION FEEDBACK — Review pending: map original bullets to repository and runtime evidence.
- [ ] 99. REFRESH TEST — Partial: local evidence recorded; review remaining original bullets.
- [ ] 100. OPEN-IN-NEW-TAB TEST — Partial: local evidence recorded; review remaining original bullets.
- [ ] 101. MULTIPLE TABS — Partial: local evidence recorded; review remaining original bullets.
- [ ] 102. SESSION EXPIRATION — Partial: local evidence recorded; review remaining original bullets.
- [ ] 103. VERSION / DEPLOYMENT COMPATIBILITY — Partial: local evidence recorded; review remaining original bullets.
- [ ] 104. ROLLBACK — Review pending: map original bullets to repository and runtime evidence.
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
