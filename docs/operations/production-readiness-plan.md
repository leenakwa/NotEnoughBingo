# Production readiness execution plan

The [complete user brief](production-readiness-prompt.txt) is authoritative.
The [working checklist](production-readiness-checklist.md) copies every
original requirement into a checkbox. The [105-section tracker](production-readiness-tracker.md)
records the predeployment verdict for each section. This plan sets the order
of work; it does not reduce the checklist.

## Working rules

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
open for itemized review: the 2026-09-30 tracker has 56 verified sections,
42 partial, six N/A and one deployment-only. The current local full live
regression is 53/53 and the frontend gate has 148 tests; these counts do not
close unreviewed requirements. Stage 4 is in progress: source `f0588c4`
passed all nine CI jobs, including backend/frontend quality, both x86_64
production images, browser smoke and 53 full-stack flows. It includes the
Python dependency locks, abuse/error/privacy work, API destination guard, and
mobile WebKit scroll correction. Source `3d3c7cc` then passed all nine jobs
with the unauthenticated-API 401 correction. The registration/reset
field-error and form-affordance commit `dd621d7` passed all nine CI jobs. The
Explore correction source `fb096a4` passed seven implementation jobs, including
the full-stack flows and production images, but the browser smoke job timed out
while its runner downloaded Playwright system packages; the release gate failed.
The smoke job now uses a pinned Playwright browser image and needs an
exact-source CI run with the subsequent form/API fixes.
Registry promotion and rollback on the target platform remain untested.
Stage 5 has no real deployment evidence yet; the user confirmed that providers
and a domain have not been selected.
The aim is to complete product and repository QA before deployment, leaving
only environment-specific smoke and recovery checks after release.

## Immediate work queue

1. Commit and verify the current catalog/notification API contract,
   editor/account form recovery, and Playwright CI fix on their exact source.
   The Explore correction passed local PostgreSQL and Chromium regressions,
   then its CI smoke job hit the 20-minute package-download limit. Keep the
   draft PR open while remaining local checklist items are audited.
2. Complete remaining repository-specific work in sections 4–5, 7–8, 21,
   24–25, 34/36, 42/45, 61–63, 67, 72, 76, 82 and 105. Prioritize
   remaining dirty forms, autofill/password-manager
   behavior, native zoom/ARIA/UI contrast, endpoint-by-endpoint contracts,
   database indexes/migration scale and notification/email failure paths.
   Record explicit N/A or target-only limits for each original bullet.
3. Prepare provider-independent release/rollback and monitoring artifacts;
   preserve configuration contracts, keep demo identities out of a production
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
