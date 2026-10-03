# Production readiness execution plan

The [complete user brief](production-readiness-prompt.txt) is authoritative.
The [working checklist](production-readiness-checklist.md) copies every
original requirement into a checkbox. The [105-section tracker](production-readiness-tracker.md)
records the predeployment verdict for each section. This plan sets the order
of work; it does not reduce the checklist.

## Working rules

- On 2026-10-03 the user confirmed that all subsequent local interface changes
  are intentional. Preserve the account dialogs, one-time registration language
  dialog, fixed header, hover treatment and removal of catalog/search language
  pickers. Language preferences remain in profile settings; the original
  requirement for page-level language pickers is superseded. Keep the original
  prompt intact and audit the current intended behavior.

- Preserve the current uncommitted work. Record changes and verification before
  preparing a release commit.
- For each applicable checklist item, inspect the implementation, exercise the
  real user path or production-equivalent service, fix concrete defects, and
  rerun only the checks affected by the fix.
- Record command, environment, date, result, and remaining limit in the
  [evidence log](production-readiness-evidence.md). A passing unit test is not
  evidence that an external production integration works.
- Mark a tracker section verified before deployment when every applicable
  original bullet has relevant repository or production-equivalent runtime
  evidence. Explain non-applicable bullets and record external-only checks in
  the deployment handoff instead of treating all local work as zero progress.
- Walk the product as a new and returning user. Fix friction, unclear copy,
  awkward mobile controls, and inaccessible interactions even when tests pass.
- Keep security-sensitive test data in the isolated `nebqa` stack. Never put
  session cookies, passwords, tokens, or production secrets in the log.

## Stages

| Stage | Scope | Exit condition |
| --- | --- | --- |
| 1. Baseline and gaps | Review source, dirty tree, dependencies, current release report, and all 105 sections. Inventory missing evidence and prioritize user-critical failures. | A reproducible baseline and a specific queue of local and external gaps. |
| 2. User journeys | Anonymous, new, returning, mobile, keyboard, bad network, direct links, cross-tab, and adversarial flows. Include editor, play, social, profile, settings, uploads, emails, errors, and empty states. | Important flows work through the browser and API; defects have fixes and regression evidence. |
| 3. Quality and security | Accessibility, browser compatibility, SEO/metadata, performance, authorization, abuse limits, data integrity, logging, privacy, storage, and API contracts. | No known high-impact local defect remains; the required code and browser checks pass. |
| 4. Release mechanics | Clean install, migrations, image builds, worker/Beat, CI, scans, backup/restore, rollback, production config, and smoke instructions. | Exact release artifact has a passing gate and rehearsed deployment/rollback procedures. |
| 5. Deployment handoff | Domain, TLS, email, object storage, monitoring, alerts, external recovery, and scripted live smoke/rollback checks. | Predeployment checklist is complete; external configuration is supplied; deployment-only checks are automated and pass on the target environment. |

Stage 1's complete source/checklist inventory is recorded. Stages 2–3 remain
open for itemized review: the 2026-10-03 tracker has 55 verified sections,
43 partial, six N/A and one deployment-only after reopening storage cleanup
for the new comment cache's remaining cross-tab fallback condition. An earlier exact-source CI on
`29ac99b` passed all nine jobs: 206 backend tests, 166 frontend tests,
179 browser smoke checks and 57 live flows, plus both production image gates.
The social-form source `b466456` also passed all nine CI jobs: 206 backend
tests, 172 frontend tests, 180 smoke checks and 59 live flows.
The silent-autofill source `1f4a773` passed all nine CI jobs, including
180 frontend tests and 60 live flows, with one WebKit smoke check passing on
retry. Later social-validation source `eca9298` failed the live/release gate
because its post-password-change test API request omitted the session cookie.
The corrected browser assertion, hydration wait and root-comment recovery now
passed all nine CI jobs on `8a5d31a`: 206 backend tests, 192 frontend tests,
196 smoke checks (12 skips) and 64 live flows. The later report-recovery source
`a9b3cc4` passed local checks (198 frontend tests and eight related live flows);
its source gate failed: four report fixture-order failures and one WebKit
diagnostic request during old-document departure. The corrected ordering,
diagnostic lifecycle and reply/edit recovery now pass 209 frontend tests and
all 72 local live flows. Source `e6858a0` then passed all nine CI jobs:
216 backend tests, 209 frontend tests, 196 smoke checks (12 skips) and 72 live flows.
The later reply-query correction `8299cbf` passed all nine jobs (220 backend,
209 frontend, 72 live; smoke 194 passes plus two WebKit retries and 12 skips).
Email and smoke-readiness source `94ee150` then passed all nine jobs: 235 backend,
209 frontend, 200 smoke passes plus 12 intentional skips without retries, and
72 live flows. Frontend-release source `b5ebaff` then passed all nine jobs (240 backend, 221
frontend, 200 smoke passes with 12 intentional skips and no retries, 72 live).
Partial-settings source `7381042` then passed all nine jobs (240 backend, 226
frontend, 200 smoke passes with 12 intentional skips and no retries, 74 live).
Editor hydration source `371dd1b` then passed all nine jobs (240 backend, 231
frontend, 200 smoke passes plus 12 intentional skips without retries, 76 live).
Catalog/player source `6eaaf25` then passed all nine jobs (240 backend, 240
frontend, 200 smoke passes plus 12 intentional skips without retries, 78 live).
Editor mutation source `6bcc3ef` then failed CI: 39 live passes, two failures
and 40 not run (other quality/image/smoke jobs passed). The own-draft URL/upload
regression and isolated cleanup correction, together with player lifetime guards,
passed locally; their `07d3e41` gate then failed with 82 live passes and one
uncaught WebKit Load failed error (other checks/images passed). Native editor
URL/query sync, card action lifetime and active-profile-tab corrections now
pass 262 frontend tests, nine engine cases, three WebKit journey repetitions
and related editor/shared-result flows locally. Its `bdd953b` gate failed
on a password-change/late-analytics cookie race (82 live passes, one failure,
three not run; smoke 199 passes/one retry/12 skips). Session-cookie correction,
notification and shared-result action guards now pass 273 frontend tests,
242 backend tests plus one container-only skip, 12 related engine cases and the
controlled cookie-race live journey locally. Source `82f2f07` passed all
functional/image/foundation jobs (243 backend, 273 frontend, 200 smoke plus
12 skips without retries, 90 live); history/Release failed on two synthetic
test-password findings. Generated test passwords and two exact historical
exemptions then passed all nine jobs on `eca815d` (243 backend, 273 frontend,
200 smoke plus 12 skips without retries, 90 live). Subsequent profile loading/
viewer/action corrections pass 281 frontend tests and nine engine cases locally;
their `438a452` gate failed one avatar keyboard assertion (91 live passes, one
failure, one not run; other seven jobs and 200 smoke plus 12 skips without
retries passed). The keyboard scenario now waits for loaded profile activity
before testing its tab order; a held response reproduced the dependency. Keyboard/activity source `4b5e8e4` then passed all nine jobs (243 backend, 281 frontend, 200 smoke plus 12 skips without retries, 93 live). Account action ownership now passes 293 frontend tests, build/format and 12 real-stack/browser cases locally; accepted avatar/export responses cannot continue old UI work after departure. Account/session error timing also has focused unit evidence. Its new source requires its own CI. These
counts do not close unreviewed requirements. Stage 4 is in progress: source `f0588c4`
passed all nine CI jobs, including backend/frontend quality, both x86_64
production images, browser smoke and 53 full-stack flows. It includes the
Python dependency locks, abuse/error/privacy work, API destination guard, and
mobile WebKit scroll correction. Source `3d3c7cc` then passed all nine jobs
with the unauthenticated-API 401 correction. The registration/reset
field-error and form-affordance commit `dd621d7` passed all nine CI jobs. The
Explore correction source `fb096a4` passed seven implementation jobs, including
the full-stack flows and production images, but the browser smoke job timed out
while its runner downloaded Playwright system packages; the release gate failed.
The pinned Playwright image then passed in CI on source `2981986`, together with
the other implementation jobs except the full-stack suite. One of 54 live
scenarios failed: WebKit sent a first login request with the CSRF cookie but
without the CSRF header. Source `cb812e2` corrected the bootstrap and passed
all nine CI jobs: 191 backend tests, 150 frontend tests, 54 live product flows,
browser smoke and both production images. One static WebKit smoke assertion
passed on retry because its selector briefly matched both the loading screen
and the Explore page; the selector has been narrowed for the next source.
Registry promotion and rollback on the target platform remain untested.
Stage 5 has no real deployment evidence yet; the user confirmed that providers
and a domain have not been selected.
The aim is to complete product and repository QA before deployment, leaving
only environment-specific smoke and recovery checks after release.

## Immediate work queue

1. Exact-source CI on `29ac99b` passed all nine jobs, including the database
   audit scripts, browser-error collection and narrow historical documentation
   scan exemption. No image was promoted or deployed. The subsequent social
   form changes on `b466456` passed all nine CI jobs. The later silent-autofill
   correction on `1f4a773` passed all nine jobs. The later `eca9298` gate failed
   and the corrected browser-session assertion plus comment recovery then passed
   all nine jobs on `8a5d31a`. Report recovery on `a9b3cc4` has local evidence
   and its source gate failed. Its fixture-order and document-lifecycle
   corrections now have full local evidence, together with reply/edit recovery;
   source `e6858a0` passed all nine CI jobs. The later reply-query correction
   `8299cbf` passed all nine jobs, with two smoke cases passing on retry.
   Email TTL/invalidated-link guards, the real QA SMTP retry drill and
   smoke-readiness/fallback source `94ee150` passed all nine jobs. The later
   frontend-release source `b5ebaff` also passed all nine jobs, including
   production-image identity/relabel guards. Partial-settings source `7381042`
   passed all nine jobs. Editor hydration source `371dd1b` passed all nine jobs.
   Catalog/player source `6eaaf25` passed all nine jobs. Editor mutation
   source `6bcc3ef` failed two live cases; own-draft upload continuity and isolated
   cleanup corrections now have local evidence, together with player lifetime
   guards. Source `07d3e41` then failed one live WebKit page-error assertion;
   native URL/query sync, card lifetime and profile-tab corrections now have
   local evidence. Their `bdd953b` gate then exposed the session-cookie race;
   its server fix and notification/share guards have local evidence and need
   their own gate.
   Keep the draft PR open while remaining local checklist items are audited.
2. Complete remaining repository-specific work in sections 4–5, 7–8, 21,
   24–25, 34/36, 42/45, 61–63, 67, 72, 76, 82 and 105. Prioritize
   remaining component-state families and per-form/control coverage. Player
   queued writes/conflict/reset/share/like callbacks now have seven new unit
   regressions and six related real-stack/browser cases across leave/logout. The section 4
   partial-data sweep now includes catalog hints/results, Discover refresh, player
   author/progress/comments independence and header unread-count failure. Account settings now have
   independent sessions/preferences failure/loading/retry evidence and actual
   password success despite an unavailable subsequent sessions refresh. Do not
   close the whole UI-state section from those account cases alone. Editor
   initial draft/optional-download reads now have independent failure/retry and
   stale-response protection with real-stack evidence; editor mutation guards now stop obsolete saves/publications/exports across
   departure/draft-route/session boundaries, with eight new unit cases and seven
   real-stack/browser cases including separate blank Create navigation. Player
   queued mutations now have bounded-lifetime evidence; follow/management and
   broader account/device timing still need case-by-case evidence. Shared-result
   required reads now clear old snapshots and ignore aborted success, with four
   unit cases and two normal live journeys. Card likes now have three new
   unit regressions and six related engine cases across delayed success/denial,
   duplicate clicks and departure. Repeated active profile tab selection is
   corrected with unit and browser evidence. Remaining component mutation states
   include account upload/security/preferences/export/deletion, including callbacks into
   the profile parent. Profile required-load failure, independent viewer retry/
   pending controls and save/privacy/language/follow lifetimes now have eight
   unit cases and nine related engine cases. Dedicated player follow/management
   boundaries remain. Notification read actions and shared-result copy/
   native-share completion now have regression and engine evidence; actual
   physical-device OS dialogs/permissions remain. Then audit
   remaining dirty forms, autofill/password-manager
   behavior (silent-fill submission is verified; native saved credentials are not),
   remaining per-form/control checks (root/reply/edit and reopened-report
   recovery now have full local navigation/auth/cleanup evidence), native zoom/ARIA/UI contrast,
   endpoint-by-endpoint contracts,
   database defaults/transactions and remaining notification/email failure paths.
   Verification expiration and stale reset mail are corrected; four mail tasks
   have retry/exhaustion evidence, and a real QA SMTP outage recovered through
   worker delivery and a successful reset. Provider delivery/alerts remain.
   Record explicit N/A or target-only limits for each original bullet.
   The 2026-10-03 structural and scale drills now cover installed indexes,
   constraints, foreign keys/nullability and a 180,000-cell migration; the
   remaining database queue is defaults/transactions and target operational
   compatibility, with representative joined/API/concurrent-load measurements
   still belonging to the performance audit. Social list serialization now has
   four guest/authenticated query-growth regressions with distinct authors,
   avatars, likes and nested previews; a reply-parent N+1 was fixed (8 root-page
   and 6 reply-page queries at one and 24 items). Other joined/API/load paths remain.
3. Prepare provider-independent release/rollback and monitoring artifacts;
   browser exception/rejection/API failure capture is now locally exercised.
   Section 63 still needs actual provider delivery/grouping, target configuration
   and alert delivery. Old-tab frontend release correlation is now locally
   verified. Private source maps follow the explicit section 81/runbook policy:
   public maps disabled, provider upload not configured or required for launch.
   Preserve configuration contracts, keep demo identities out of a production
   database and retain previous images/configuration. External inputs stay
   separately listed; do not stop local work merely because providers are absent.
4. Once an operator supplies the actual domain, services, support/legal
   decisions and access, configure and verify DNS/TLS, delivery, alerts,
   off-site database/media restoration and target rollback. Run the scripted
   real-domain smoke as part of rollout. These checks cannot be claimed in
   advance or removed by a local build.

## Local milestones already exercised

Password reset and email delivery, true 404s, two-tab logout, offline draft
recovery, focus and active-action session expiry, media error presentation,
language filters at narrow and wide widths, publication requirements, and
production-image origin validation, notifications, account preferences,
multilingual long content, and email change have specific browser or server evidence in
the [evidence log](production-readiness-evidence.md). They remain separate from
the still-open production checklist boxes.
Signup and login sections 10–11 now have every applicable predeployment bullet
checked, including live email verification, resend, invalid credentials,
rate limiting, keyboard submission, and already-authenticated navigation.
Password reset and logout sections 12–13 are also checked with local mail,
token-expiry, credential/session, Back-navigation, and recovery-cleanup evidence.
Authorization section 14 is checked after direct admin/API and cross-account
resource probes, including an old-share media privacy regression that was fixed.
Onboarding section 15 is checked after a live new-account walk, persisted
language choice and skip, and useful empty-profile actions at narrow width.
Empty states section 16 is checked after live search, comments, notifications,
and blank-editor paths plus static empty-feed accessibility checks; absent
commerce, teams, and analytics screens were classified as not applicable.
Search section 17 is checked after bounded API queries for empty, Unicode,
special-character, and paginated results plus live Enter, combined-filter,
URL, and clear flows and static loading/debounce checks.
Lists section 18 is checked after paginated card and profile collections,
filtered ordering, long-content layout at 320 and 1710 pixels, and explicit
classification of table-only requirements as not applicable.

## Launch blockers currently outside the local stack

The actual production domain, DNS/TLS edge, secrets, managed services,
transactional email domain, monitored support identity, legal/business
approval, error monitoring/alerts, off-site data and media restoration, and
real-load targets require target-environment access or owner decisions.
They remain open until verified; local substitutes do not close them.
