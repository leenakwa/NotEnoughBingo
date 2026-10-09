# NotEnoughBingo predeployment readiness tracker

The complete user prompt is preserved [byte-for-byte](production-readiness-prompt.txt)
(105 numbered sections, 40,643 bytes, SHA-256
`7b920f477e1087c2fe456f7bdbafef11e00e7be8ca17bc8ec99f180c274b65d9`).
Its [working checklist](production-readiness-checklist.md) includes every original
requirement as a checkbox: 1,142 items. The source prompt, including its final
sequence and definition of done, remains authoritative.

## How to read this tracker

This is a **before-deployment** assessment of the actual NotEnoughBingo
repository and scoped local/CI observations. Each result retains its source,
runtime settings and verification limits. A section
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

Snapshot for 2026-10-09: **58 verified**, **40 partial**, **0 awaiting itemized review**, **6 N/A**, **1 deployment-only**.
These counts describe predeployment evidence, not a readiness percentage. The
release cannot be considered ready while applicable predeployment bullets have
unresolved failures or missing evidence.

## Repository review map

### Latest observed source gate — 2026-10-09

Latest attempted source gate: exact
`d515b792ab606a432b929f88e73077eef2e109e3`
[CI37878186145](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37878186145)
finishes FAILURE: ten jobs succeed, full-stack and Release fail. Backend469 and
Node22.23.3 frontend666/46 files pass, including all49 editor cases. Browser
reports retain590 expected,12 skipped, one unexpected and zero flaky cases.
The new export test fails at retry0 before recovery assertions: its global alert
locator matches the editor error and Next route announcer. Original trace proves
backend202 and injected503, not successful same-job retry/download. The working-
tree fix scopes both alert assertions to the editor main region; lint, formatting,
discovery and independent review pass, actual execution awaits the next source.
Root verifies46 retained hashes, nine fresh artifact digests and source/merge
`d9507156b1b2b2ee4fc805107d72297e68f7554d` tree
`05c30f51fb78e7e70755e81337c9c555e4758e5d`. Failed artifacts remain retained.

Latest successful completed committed-source gate: exact
`bb4ae862cb7bcdd73b20680b9be98063242626a9`
[CI37875904112](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37875904112)
finishes SUCCESS with all12 jobs:469 backend,655 frontend/46 files and590 expected
browser passes with12 intentional skips, zero unexpected cases and zero flakes.
Chromium passes119 smoke cases, each other profile115/four skips, and full-stack
flows126. The new static public-head loop passes once at retry0 in8690ms; all28
metadata unit cases pass. Both production images and Release pass. The cached
backend-image SBOM records Gunicorn26.2.2 and its production-default unsafe-startup
guard passes; the locked backend includes all16 auth-cache cases.
Sourcebb4 and logged tested merge `c271cb8d2969dc513b9c7fa397cc305d43ff65a8`
share full tree `6fbd557c5d388d7dd8713d0b150a45fe05e83f1b`. Root independently
verifies both Git API commits,47 retained CI file hashes and all nine fresh
artifact API digests against actual bytes; archive integrity passes.
See the [datedbb4 gate](production-readiness-evidence.md#2026-10-09--completedbb4ae86-source-and-rendered-metadata-gate).

The optimized frontend-image step verifies seven static routes plus filtered
Explore: eight200 heads/128 assertions, including query-free canonical and Open
Graph URLs and preserved shared metadata. Original runtime JSON identifies image
`sha256:c193ea746bcd14f199c182295b2ff45f00d14576f27e4d08b08c332533457502`,
NODE_ENV=production, environment=staging, embedded mergec271 and the synthetic
`https://ci.not-enough-bingo.invalid` origin. The step succeeds after the script's
required removal of its uniquely named container; no independent post-removal
listing is retained. This closes URL bullet994 and restores section91 Verified
before deployment. Current821 checked/321 unchecked,89 N/A/232 applicable and
58 Verified/40 Partial totals apply after reopening unclear-error item25.
Items25 and27 stay open; section1 remains Partial.

This gate includes the metadata helper/probe, asset labels, installed-Gunicorn
OSV guard and prior preview/recovery/Gunicorn/navigation changes. The actual CI
OSV guard passes for installed26.2.2 with one matching dependency, no skip and
vulns[]; original command/runtime stdout is retained, but generated audit JSON
is not. The ordinary full PyPI audit still explicitly skips Gunicorn26.2.2.
This scoped known-advisory result does not guarantee absence of undisclosed
vulnerabilities.

Committedbb4 creates duplicate export jobs after an uncertain accepted POST or
exhausted polling. Correctiond515b79 retains keys/resumes known jobs;49 editor
cases pass on host Node24 and actual CI Node22.23.3, with three original before-
fix failures retained. Its new live test fails on the alert locator before the
retry/download assertions; the corrected fixture still awaits actual execution.
These export changes are outside the completed successfulbb4 gate. Cached local
frontend ec69223/backend b6aabca/worker a3 and keepalive0 observations retain their
separate scopes. The isolated metadata probe uses a loopback backend alias and
establishes rendered heads, not functional backend availability, current
Django/Gunicorn recovery/privacy transport or public deployment readiness.

Historical605 all12 SUCCESS,469 backend/647 frontend/46 files,589 expected browser
passes,12 skips/zero flakes,44 hashes/nine digests and shared tree
`8d360241f5cb09ad4b145f19a1879b5ab4219ede` remain retained in the
[dated605 gate](production-readiness-evidence.md#2026-10-09--completed6050e9e-source-and-image-gate).

Historical991 all12 SUCCESS,469 backend/635 frontend,577 expected browser passes,
12 skips/zero flakes,46 hashes/nine digests and shared tree
`57617b27dc7618e765aa39b634ea4808ce56ea3e` remain retained in the
[dated991 gate](production-readiness-evidence.md#2026-10-09--completed9910827-source-and-image-gate).

Historicale8 all12 SUCCESS,469 backend/632 frontend,576 expected browser passes,
one WebKit flaky case and12 skips,41 hashes/nine digests remain retained in the
[datede8 gate](production-readiness-evidence.md#2026-10-09--completede8d9e58-source-and-image-gate).
Its initial five-second heading assertion occurs while Trending RSC is pending
and Discover remains visible; retry1 passes. The underlying delay remains
unestablished, and its original flaky report is not relabeled clean.

Historical84 all12 SUCCESS,469 backend/625 frontend/577 browser passes with no
reported flakes,35 hashes, nine artifact digests and shared tree
`609dd617f5feac464420e282f30a610b9ed3cc10` remain retained in the
[dated84 gate](production-readiness-evidence.md#2026-10-09--completed84b5b87-source-and-image-gate).

Historical188 all12 SUCCESS,466 backend/625 frontend/577 browser cases,26 hashes,
nine artifact digests and shared treeb4a10211866eb496ce1155c280b14f816d6807b4
remain retained in the [dated188 gate](production-readiness-evidence.md#2026-10-09--completed188c0d9-source-and-image-gate).

Historical [CI37864190158](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37864190158)
on39fe568 retains its backend OpenAPI comparison failure and final CANCELLED run:
four browser jobs are cancelled, full-stack/images are skipped and Release fails.
Its absent maxLength254 constraints were subsequently corrected; fresh
PostgreSQL-engine schema generation matches and frontend types are unchanged.
The passing188 run supplies the previously pending exact-source/image gate;
the failed39 evidence is preserved. External GitGuardian check113607951080 on188
still reports FAILURE: six occurrences, four incidents and127 commits. Existing
historical test-source classification cannot establish exact provider spans,
external use or vendor disposition; operator review remains open.

The [real recovery transport packet](production-readiness-evidence.md#2026-10-09--real-recovery-transport-and-anonymous-auth-cache-gap)
retains first post-reset login500/ECONNRESET and one authorized retry200. It
observes four same-origin registration-email Referer matches and anonymous
verification200 returning own email without explicit Cache-Control. The email-query
UI choice remains pending. The later auth-prefix private/no-store fix passes
16 focused SQLite tests and scoped security review; it is outside exact188 CI.
Committed84 and latestbb4 backend469 pass under locked dependencies, including
all16 cache cases; optimized-runtime transport remains unverified. A subsequent single
post-reset login returns200 with33 fresh upstream connections/zeroRST and stable
worker snapshots; original500 cause remains unknown. Section59, expired-links
ID569 and section76 remain open; counts and checkbox states are unchanged.

Currentd515 external GitGuardian check113651482045 remains FAILURE with the same
six occurrences/four incidents, now133 commits; historicalbb4/605/991/e8/84/188 metadata is retained.

The [committed preview projection](production-readiness-evidence.md#2026-10-09--preview-ssr-unused-field-projection)
removes only unused position/image_asset_id fields from feed/Explore SSR preview
props. Thirty-six focused server cases, full typecheck, scoped lint/format and
independent source review pass. Actual source-bound development pages retain the
raw API content except those fields: normalized JSON34,709→31,642 bytes for five
boards/77 cells on each route. Narrow/wide layout and first-card navigation pass;
network capture is unavailable, so no new zero-initial-feed-request claim follows.
This patch is included in e8/991 and latestbb4 CI, including all seven projection cases. Its
actual development-media observation remains separate; no optimized browser
runtime, wire/gzip or latency proof follows. No checkbox/count or section verdict
changes follow.


Earlier completed gate — Exact `5f4bca9` [CI37844368314](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37844368314)
finishes successfully with all12 jobs:446 backend,619 frontend/44 files,444 smoke
and12 intentional skips, plus125 full-stack cases; no reported flakes/retries.
Chromium passes114 smoke cases; each other profile passes110 with four skips.
Both production images, Release and all baseline gates pass. The password-reset
journey passes6.6s with held logout503→real204/login; the session journey passes
4.7s with actual owned current-session revocation. Branch5f and tested merge
`f8f07dc24736450a617525726ac606671a9765b2` share full tree
`996c08acbf0f53024927392a60ee1a45eecb55e8`. Original log ZIP, all nine artifacts,
API metadata, integrity checks and checksums are archived privately under
`evidence-5f4bca9-2026-10-09/ci/`.

A subsequent application patch shares one BroadcastChannel instance per
document while preserving the legacy logout string. It targets the native
same-document logout refresh race recorded below. The full frontend unit suite
passes623 tests/45 files in10.85s;
typecheck/lint/format and scoped correctness/security/privacy review pass.
A scoped browser regression passes all four configured profiles using synthetic
API responses, real mounted account/auth UI and native BroadcastChannel transport
with storage blocked. Own logout opens no expiry dialog; a separate legacy
logout witness still does. The bounded native current-frontend rerun below
subsequently passes; exactc74 CI subsequently passes as recorded above.
Exact5f CI does not cover this later patch. No global checklist item,
deployment or broad readiness claim is advanced.

The bounded native Chrome200% currentc74 frontend/cachedb6 backend rerun
subsequently verifies report focus/scrolling and own logout without an expiry dialog.
See the [dated evidence](production-readiness-evidence.md#2026-10-09--current-frontend-native-chrome200-report-and-own-logout).
That packet made no counter change; the subsequent representative native44 packet
closes the original zoom bullet and section24 within its recorded scope.

Earlier failed gate —2026-10-08: Exact `761af3e` [CI37834132797](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37834132797)
finishes with ten successful jobs and failed full-stack/Release. All four smoke
profiles and both production images pass:446 backend,619 frontend/44 files,436
smoke/12 intentional skips; live120 pass, two fail and three do not run. Each
smoke profile passes all six new export and eight social cases. HEAD and tested
merge share tree `7bc1b810ce9f324bb10a68937e26d1907985b11d`; original logs,
all nine artifacts, metadata and verified checksums are privately archived. The export creation503 case incorrectly
uses a success-only response helper; it throws on the intended503 before its
remaining assertions. The password-reset journey interrupts logout with hard
navigation approximately3.8ms after the POST starts; the aborted request leaves a
session-expired dialog intercepting final login. Trace shows no final login POST.
Both test synchronization corrections and the public-profile Unfollow503→keyboard
retry→real204/API/reload extension subsequently pass the earlier exact0d CI. The failed
run remains historical evidence; application behavior, timeouts, retries and rate
limits are unchanged.


Earlier green source `38fd3d1`
[CI37829451235](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37829451235)
passes all12 jobs:446 backend,619 frontend/44 files,380 smoke/12 intentional skips
and125 full-stack cases, both images and Release. No reported flakes/retries.
Extended avatar attachment/removal failure recovery passes9.3s; Retry/Resend
competition at320/1710 passes in all four browser profiles. Tested merge and
branch share tree `28bf9d654eef1378420b357e127bd928d5285fd8`. Original logs, all
nine artifacts, metadata and checksums are archived privately. Subsequent export
failure coverage and backend connection changes first reach failed761; the
corrections subsequently pass exact0d above.

Previous green source `a164b1b`
[CI37826157791](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37826157791)
passes all12 jobs:446 backend,619 frontend/44 files,372 smoke/12 intentional skips
and125 full-stack cases, both images and Release, with no reported flakes/retries.
Dedicated avatar/deletion fixture state removes incidental registration traffic;
both token-only recovery journeys pass together with avatar/deletion. Tested
merge and branch share tree `a81c5eedab57dc28ce26ad12cac1a7fc663a0531`.
The private archive retains logs, nine artifacts, metadata and checksums.
No checklist counter is advanced by this gate alone.

Earlier failed gates:

Exact `678240f` [CI37821941465](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37821941465)
has ten passing jobs and failed full-stack/Release. Full-stack124 passes/one failure:
new avatar/deletion and guest registration recovery pass, but email-change setup
verification receives Nginx HTML429. Moderator isolation does not bypass the
shared-IP authentication limiter; dedicated fixture actors are being prepared. No counters are advanced.

Exact `a55a2b1` [CI37818441348](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37818441348)
has ten passing jobs, failed full-stack and failed Release:446 backend,619 frontend,
372 smoke/12 intentional skips; full-stack123 passes/one failure. New confirmed
account deletion passes; later token-only registration recovery receives429 after
the new anonymous setup consumes the shared verification quota. The trace and
serial request inventory support fixture interference; isolation is being amended
without changing production limits or guest recovery assertions. At that point
the latest completed green source was71a22ec/CI37812635002. No section is closed by this partial gate.

Earlier source gates:

Source `a2c2d6f` passes all nine jobs in
[CI37769102508](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37769102508):
backend402/105.73s on Python3.13.16/PostgreSQL, frontend589/43 files,
smoke372/12 intentional skips17.3min and full-stack123/8.2min; foundation,
full-history secrets, both production images and Release pass. No browser flaky
summary. Tested merge33a8aaf58bb15f11577019a14c9315d936455050 and branch a2 share
complete tree15a3af87976ca42bc80a24dc2174c1efeb0414ec. Earlier failed/cancelled
runs remain in the dated evidence. Private-API caching and framework/dev logging
corrections have fail-before regressions and independent review. Exact optimized
a2 registration/player/report/cache observations pass; backend uses local
fixture development settings. CSRF copy and other UI choices remain open.
The later docs-only a4c5fb7 gate passes all nine jobs in
[CI37774879912](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37774879912);
its tested merge and branch share full tree9462cad5186e138b2ea30d698b1cb1ef2fe1d2ef.
Application source and the configured a2 runtime are unchanged.
The subsequent docs-only e57de31 gate also passes all nine jobs in
[CI37777997102](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37777997102):
402 backend/100.95s,589 frontend/43 files,372 smoke/12 intentional skips/12.3min
and123 full-stack/7.8min. Tested merge9f85c085c21e24bef5cac2d2e97956e2efe821f3
and branch e57 share complete treee70fc3bef993e410299b785e59f90a5dd2667e2f.
A later single a2 RSC flow reads all17 observed bodies to EOF while CDP marks9
requests canceled, including the clicked navigation. The grid renders with no
page/console errors; transport/capture causation remains unproven.

The [exact configured Explore image](artifacts/explore-pending-submission-2026-10-08.json)
passes nine controlled guard cases in Chromium/Firefox/WebKit, including repeated
Search/Enter, changed criteria, completion and actual browser Back. Eight guest
initial-layout observations use real API at390/1710: HTTP200, no page overflow,
no page errors or console warnings/errors; seven CLS0 and mobile game0.00068559.
Observed board dimensions remain stable. First frames may follow hydration;
this is not an all-layout or target Core Web Vitals verdict.118 GET RSC aborts
remain unexplained. Build/runtime/label match065, no app mounts, health200.

The prior [report image](artifacts/frontend-candidate-9920e83-2026-10-08.json)
passes five affected real flows and native narrow/wide modal/clipboard checks;
eight controlled modal cases pass separately. Earlier156 native and nine API/SSR
cases remain scoped to5e. These are isolated local observations. Target services,
CDN, capacity and native-device capabilities remain separate requirements.
Historical failures remain in the [dated evidence](production-readiness-evidence.md).

[Native keyboard proof](artifacts/native-form-keyboard-2026-10-08.json) adds30
social form walks in six Chromium/Firefox/WebKit cases at320/1710 and three Explore
Tab/Enter cases. Held social writes reach only their own intercepted endpoints;
no real writes. Corrected WebKit keyboard opening returns report focus; a separate
pointer launch leaves BODY focused, with its desired policy undecided. Earlier
auth/profile/account/editor packets retain their own source scope.

Current **821 checked /321 unchecked**. Of those321,89 are release-scoped N/A:
85 belong to the six explicitly N/A sections, and four conditional requirements
cover absent product WebSockets, invitation/receipt emails and payment-webhook
alerts. Source inventory and independent review support these exclusions;
232 are applicable unchecked bullets. The42 final
execution bullets overlap earlier checks, so these counts are not independent
tasks or a readiness percentage. The first nine section105 actions have actual
local CI/runtime/search/configuration evidence; the deployment sequence and
Definition of Done remain open. Section42 backup/migration/rollback
contracts and section82 applicable API contracts have local evidence. Provider
and target measurements remain open in their relevant sections.

The subsequent cache-readiness correction returns503/degraded when the cache
round-trip fails; five endpoint regressions and13 scoped observability checks
pass locally with independent review. The388-test Python3.13/PostgreSQL job and complete ceb source gate
pass. Actual Redis is separate from the mocked endpoint regressions. The earlier configured frontend proofs above remain scoped to065.

The subsequent d8 loading-layout fix seeds the header from the
already obtained server account and reserves the accepted Follow slot. All601
frontend tests, lint and TypeScript pass with independent code/auth reviews.
Its CI37781920465 stops at formatting in one player test; the formatting-only
correction passes the full format check. One exact-d8 built-image packet records
zero measured header/Follow/actions/heading/board movement in seven contexts,
including optional profile errors. Six scenarios pass; one retains an unexpected
console500 and real session GET500. The corrected cca gate passes seven jobs,
including123 live flows, but its smoke job hits the20-minute limit after352 passes
and12 intentional skips, leaving20 cases without results; Release fails.
The subsequent022 unread-count correction passes609 tests and a two-width
controlled browser packet. Four-project smoke CI preserves all384 discovered
cases and the existing limits. Exact5f28e03 CI37786669037 passes all12 jobs:
414 backend,609 frontend,372 smoke/12 intentional skips and123 full-stack flows,
including both images and Release. Tested merge and branch full trees match.
The subsequent slim-preview-media patch passes exact5ed50c0 CI37790158585:
423 backend,610 frontend,372 smoke/12 intentional skips and123 full-stack flows,
all12 jobs successful with matching full tested/branch trees. Section5 stays
partial because the unexplained session500 and other scoped gaps remain.

Subsequent optional-analytics and profile shared-result privacy corrections
have scoped fail-before regressions and independent reviews. Their complete
b6aabca source gate CI37796382333 passes all12 jobs:435 backend,619 frontend,
372 smoke/12 skips and123 live flows, with matching full trees. Subsequent expiry
test additions pass18 local PostgreSQL cases and exact7534134 CI37799307071
passes all12 jobs:437 backend,619 frontend,372 smoke/12 skips and123 live flows,
with matching full trees. A separate real Redis probe verifies natural local
expiry. Subsequentbc38a5a CI37802454204 passes all12 jobs:446 backend,619
frontend,371 clean smoke/one recovered WebKit flake/12 skips and123 live flows,
with matching full trees. The first reset-password trace records a WebKit
network-process crash/failed second document; its initiator remains unproved. Trusted-localhost feedback/loading
packets retain network-abort failures; feedback placement awaits the user and
the earlier profile fixture lacked a next page. The subsequent disposable25-board
packet verifies actual API pages24+1 and Next/page2/Previous/page1 at320/1710px;
pagination disappears during loading and its treatment awaits the user.
39 unattributed request aborts prevent a clean-network claim; owned cleanup
passes. Exact docs-only `b04fcad` CI37806507157 passes all12 jobs with446 backend,
619 frontend,372 smoke/12 intentional skips and123 full-stack cases, no reported
smoke flakes and matching full tested/branch trees. Subsequent hidden-bio
owner/guest/unrelated controls verify API, raw HTML and gzip-decoded navigation
RSC projection; six CDP body-read errors and37 request failures keep the packet's
clean-flow/wrapper verdict failed. Owned cleanup passes; no broader privacy or
production cache claim follows. No section verdict changes.

### Accepted interface requirements

The user retains account dialogs, one-time registration language onboarding,
profile language preferences, removed catalog/search language pickers, fixed
header and intentional hover/shadow treatment. On2026-10-08 the user chooses full
profile-card text wrapping, mobile player variantB with the grid above controls,
cell font scaling with board width, and a single report-dialog backdrop matching
login. The user also chooses empty reserved space for Follow author while its
optional profile loads, preserving both current follow labels without moving
the player layout. These choices supersede older interface observations; the
original prompt remains unchanged.

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

- [ ] 1. BASIC LAUNCH DETAILS — Partial: prior launch/session/configuration observations retain their scopes. Committedd515b79 retains uncertain export keys and resumes known jobs;49 editor cases pass under Node22, but its live fixture fails before retry/download assertions; the scoped alert correction awaits the next gate. A fresh player on obsolete R1 after an author publishes R2 receives a technical revision rejection; API reproduction and continued started-R1 behavior pass locally, while understandable error copy awaits the user. Items25 and27 remain open.
- [x] 2. FIRST-SCREEN / PRODUCT CLARITY — Verified before deployment: a guest can see what to do, the primary Find a bingo action and secondary Create action, free guest play and signup requirement; at 320×667 both actions fit entirely in the first viewport in that dated observation. This is a manual browser/heuristic check, not an external user-comprehension study.
- [x] 3. NAVIGATION — Verified before deployment: branded home and header/footer links, active-route labels, Back/Forward with profile recovery, direct/new-tab/reloaded routes and URL-restored Explore/share state passed. Dialog/disclosure Escape/outside and sticky-anchor behavior have live evidence. Navigation is always visible; no mobile menu is present.
- [x] 4. UI STATES — Verified locally: mapped required and optional reads cover initial/loading/loaded/empty/partial/error/offline/retry/permission/session states. Auth/header/catalog, editor publication lookup, player author/progress/comments, profile viewer/activity, account sessions/preferences/export and social surfaces retain independent usable content and protect request ownership. The final two composition gaps now pass eight cases in four engines: profile activity Drafts503 with retained profile/email edits and scoped real200 retry without identity reload; accepted real export202 followed by exact status503, retained profile/email/password edits, available unrelated actions and recovery to the same ready job. Their four accompanying reset-reuse cases also pass. Full current source CI remains separate; native form/control requirements remain in sections7/8.
- [ ] 5. LOADING UX — Partial: page/form pending states, editor save and upload status, long-running account export polling, completion feedback and real multi-MB byte progress/cancellation were exercised; synchronous submission protection covers13 data-mutating forms, editor publication and the corrected Explore search; ten Explore units and nine controlled browser scenarios pass. Layout stability still needs an itemized sweep. Skeletons are not used in this release.
- [ ] 6. ERROR HANDLING — Partial: previously exercised status/network/timeout cases retain work and offer recovery. A newly observed CSRF403 passes the technical “detail: CSRF Failed: CSRF cookie not set.” into Login. The user-facing replacement awaits the user’s choice; the section is reopened. No raw stack trace is observed.
- [ ] 7. FORMS — Partial: executed native and real API cases cover field labels, understandable nearby validation and focus, preserved work after errors, concurrent mutation protection, account-scoped comment/report recovery, whitespace/email normalization, permitted Unicode/literals and bounded numeric controls. Silent DOM-fill submission passes in four browser profiles for three account forms; this does not establish native autofill/password-manager behavior. Native Enter/Tab and intended form ownership map across14 form kinds; Linux Chromium clipboard proof covers their24 text fields plus seven editor surfaces (31 paste/23 ordinary-copy cases); required/optional copy, global limit policy, dirty-state policy and native capabilities remain open. See the dated evidence and API/auth-editor, profile/account and accessibility matrices for scope and results.
- [ ] 8. BUTTONS AND CONTROLS — Partial: semantic button/link markup, focus and disabled states, destructive styling/confirmation, and 44px editor touch targets at 320/1710px were checked. Shared button hover/press feedback now changes visibly without mobile overflow; intended submit ownership is verified across the14 form kinds. A later38-state notification/session/export DOM geometry packet has no measured clipping/overflow and retains intentional press transforms; pending label widths and feedback-card growth await user treatment. Its wrapper/clean-flow fail with20 request failures/four console errors while collection and owned cleanup succeed. Other per-control states remain open; no global verdict changes.
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
- [x] 24. ACCESSIBILITY — Verified before deployment: all18 original bullets have scoped evidence. Full-severity Axe, semantic/heading/ARIA inventory, accessible sliders, modal/keyboard/error states, contrast and reduced motion retain their earlier evidence. Representative actual Chrome154/macOS200% guest and authenticated views now cover discovery/play/auth gates, settings/editor/recovery, report, search/share/comments/profile/sessions/notifications and own logout; current44 frontend and source-equivalent historical packets retain their cached-backend limits. The original zoom bullet is verified; exhaustive engine/device/state coverage and target deployment are not claimed. Historical05d logout failure is retained, with the subsequent fix/current native reruns and exact44 CI passing. See accessibility-verification-matrix.md and the dated native44 evidence.
- [ ] 25. COPY AND PLACEHOLDERS — Partial: placeholder inventory and product/auth names checked; legal operator copy and broader error-message exposure remain.
- [ ] 26. LONG-CONTENT TORTURE TEST — Partial: prior account/title limits, 254-character email, long URL/multilingual comment and profile/card/cell checks retain their scope. The exact-a2 maximum-content packet exposes horizontal overflow in Explore active-filter labels at320px with permitted80-character title/author and15 tags of50 characters. Wrapping and overflow are reopened; the user’s choice of full wrapping or ellipsis is pending. The packet does not establish a new temporal layout shift.
- [x] 27. DATES AND TIME — Verified before deployment: UTC storage and ISO timestamps, local display with timezone, DST/calendar boundaries, and database ordering by datetime; relative today/yesterday labels are not used.
- [x] 28. NUMBERS — Verified before deployment: bounded integer counts and percentages, invalid-number recovery guards, compact notation and decimal rounding; no currency capability in this release.
- [x] 29. LOCALIZATION / INTERNATIONALIZATION — Verified before deployment: English UI and email, explicit content languages, persisted language preferences and supported filter URLs, local date/number formats, plural labels, and RTL text direction. Catalog/search language pickers are intentionally removed by the 2026-10-03 instruction; no translated UI routes or currency feature.
- [x] 30. 404 HANDLING — Verified before deployment: unknown/legacy routes, malformed and deleted bingo IDs, private/missing resources, real SSR 404 status, explanation and Discover return path.
- [x] 31. GLOBAL / 500 ERROR HANDLING — Verified before deployment: route and root error boundaries, safe retry/navigation, logged 500, generic public response, and X-Request-ID correlation; external error tracking remains in section 63.
- [x] 32. OFFLINE / BAD NETWORK — Verified before deployment: offline draft recovery, slow-search loading, finite API/upload deadlines, actionable failures, retry/cancel, and progress-reset rollback with recovery.
- [ ] 33. BROWSER COMPATIBILITY — Partial: installed Chrome and Safari, Playwright Firefox, WebKit, and mobile emulation cover core flows; actual Edge and iOS/Android browser devices remain unverified.
- [ ] 34. PERFORMANCE — Partial: production bundles, request counts, N+1, gzip, cache policy, image/font assets, and layout shifts reviewed. Social API root/reply pages now have distinct-author/avatar/like query-growth regressions: 8 root-page and 6 reply-page queries at one and 24 items; a reply-parent N+1 was fixed. Target CDN choice and real-network/load budgets remain open.
- [x] 35. FONTS — Verified before deployment: UI uses system stacks; the worker ships Pango/Noto fallback and shaping for all 15 content languages plus emoji. Real PNG/PDF downloads were visually checked, with zero missing glyphs in native layout diagnostics and no line truncation.
- [ ] 36. SEO FOR PUBLIC PAGES — Partial: configured production metadata, robots/staging noindex, headings, canonical URLs, slash redirects, local duplicate handling and scalable sitemap are verified locally; target www/alternate-host and HTTP→HTTPS verification remain.
- [ ] 37. SOCIAL SHARING — Partial: real HTML now emits absolute branded 1200×630 OG/Twitter images for catalog, bingo, profile, and shared result; external service previews and the final domain remain.
- [ ] 38. DOMAIN AND DNS — Partial: public smoke script is prepared; the actual domain, records, and propagation need target-environment evidence.
- [ ] 39. HTTPS / TLS — Partial: smoke script enforces HTTPS; certificate and edge configuration need target-environment evidence. Product WebSocket transport is N/A for this release; generic proxy Upgrade support and development WS CSP allowances do not establish a product WebSocket feature.
- [ ] 40. ENVIRONMENT VARIABLES — Partial: frontend image build/runtime origin contract, Django production origin consistency, and local-env isolation verified; real DB, storage, email, monitoring, and public origin values remain.
- [x] 41. SECRETS — Verified before deployment: complete-history Gitleaks, tracked-path and ignore rules, Docker build contexts, and client-bundle marker scan found no real secret; OAuth is absent.
- [x] 42. DATABASE — Verified before deployment: PostgreSQL defaults/constraints/transactions, realistic existing-data migration and10,000-board preservation, executed dump/checksum/isolated restore, plus immutable old-web→forward schema→compatible worker/new-web→old-web rollback preserve users, durable records and sessions. Business models, migrations and worker/task contracts retain the rehearsed a3 implementation; the subsequent cache-readiness HTTP-status correction has separate regression evidence and awaits its source CI gate. This closes the local contract; managed snapshots/WAL/off-site, online locks/target load and actual provider/registry/deployment remain in sections34/44/103–105.
- [x] 43. DATA INTEGRITY — Verified before deployment: PostgreSQL concurrent likes/follows, versioned editor/progress conflicts, idempotent draft/publication/export/session/report/notification calls, soft-delete threads, reference-aware media and abandoned-job recovery passed; webhook duplication is N/A.
- [ ] 44. BACKUPS — Partial: byte-identical current backup/restore wrappers pass an isolated PostgreSQL rehearsal; baseline users and63 migration rows restore exactly, the post-backup user disappears, and migration/check plus writer-stub stop/restart pass. The local restore procedure and execution are verified with retained dump/checksum/logs and independent review. Target backups, scheduling, retention and off-site durability remain open; stubs do not prove deployed application recovery.
- [ ] 45. EMAILS — Partial: registration verification, password reset, email-change and security notices have production-origin links and plain-text bodies; verification/reset subjects are branded, while several security-notice subjects omit the brand and await the user’s copy decision; messages that direct users to support now include the public support page. Local mail flow and expiry checks passed. Messages now show their stored UTC expiration; queued resets skip invalidated tokens. Fifteen new retry/exhaustion/expiry guards, 46 related account cases, all 234 local backend tests (plus one infrastructure-only skip) and three live email journeys passed. A real isolated QA SMTP outage produced a worker retry, delivery after restoration and a successful API reset; the temporary account was removed. Sender-domain authentication, provider delivery/rate limits, a monitored support address and real-device inbox rendering still require the chosen domain and email service.
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
- [x] 58. BROWSER STORAGE — Verified before deployment: version/revision/owner checks, corrupt/stale/unavailable storage, non-persistent browser contexts and account isolation have evidence. Private root/reply/edit/report recovery uses bounded account/board-scoped tab memory with explicit sign-out purge and generation guards. Real sender-storage-blocked BroadcastChannel fallback passed; simultaneous auth-sync storage/BroadcastChannel unavailability exposed and corrected a same-account recovery bug. Signed HttpOnly logout-event metadata survives re-login and current-version focus checks purge missed explicit logout; ordinary expiry recovery remains. Eight scoped storage cases passed in four browser modes, plus backend signature/expiry/cookie-policy and header obsolete-response controls. The historical page-error gate failed one mobile WebKit case; the integrated feedback/lifecycle/session correction now passes 36 strict related cases in four browser modes. Server/child baselines, initial account changes and simulated persisted-page recovery have targeted regressions; actual native BFCache remains unverified. Physical devices and deployed cookie domains remain in their corresponding sections.
- [ ] 59. CACHE — Partial: dynamic HTML/API no-store policy, immutable hashed assets, no service worker and logout isolation checked; bounded mixed immutable frontend, stale-tab recovery, retained assets and rollback have local proof. Target CDN/replicas and retention policy remain.
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
- [x] 70. PRODUCTION BUILD — Verified before deployment: configured optimized image0655989 builds and runs with matching release identity, zero application mounts and health200; nine controlled Explore guard cases and eight real-API guest layout observations pass within their recorded scope. Actual domain/provider values remain rollout inputs.
- [x] 71. DEPENDENCIES — Verified before deployment: committed npm and Python 3.13 production/development locks, clean installs and builds, runtime version alignment, local ARM64 native imports, x86_64 CI production image and real worker PNG/PDF export pass.
- [ ] 72. CI/CD — Partial: local evidence recorded; review remaining original bullets.
- [x] 73. TESTS — Verified before deployment: sourcea2c2d6f passes402 backend,589 frontend,372 smoke/12 intentional skips and123 live cases in complete CI, with no browser flaky summary. Earlier source preparation cancellation and same-source failed-job repeat are retained. Coverage includes auth, authorization, editor/play/save, deletion, important APIs and calculations; payments are absent.
- ↗ 74. PRODUCTION SMOKE TEST — Deployment-only: read-only script prepared; supply the real HTTPS origin and a known published board, then run it during rollout.
- [x] 75. BROWSER CONSOLE — Verified before deployment: installed Chrome inspected 16 public routes at 320/1710 px and three signed-in routes on dated optimized local builds, with zero console errors/warnings or failed assets; target-origin smoke remains part of rollout.
- [ ] 76. NETWORK PANEL — Partial:16 optimized-image samples inspected545 responses (529×200/16×202), zero redirects and only the configured loopback origin;50 retained assets passed hash/HTTP checks through promotion/rollback. Canonical exact44 guest flow is clean at both widths, removes the current-Discover prefetch and retains other-route prefetch; its115 request observations contain no credential/contact query keys. Bounded RSC comparison separates navigation phases but cannot establish cancellation causality or backend amplification. The subsequent isolated101-board packet records42 HTTP200 responses: catalog requests100/101 clamp to100 cards/10,000 cells; feed100 clamps to24. Catalog ASCII/Unicode/shared normalized-media examples measure6,729,104/15,282,104/17,714,004 JSON bytes (offline gzip6:2,129,922/476,862/530,464), with5/5/12 SQL queries. These are not absolute legal maxima, wire/CDN, browser or concurrency/SLO measurements. Unchanged-source projections, query retention/retry and no-referrer configuration have bounded evidence, but nine archivedc74 CI artifacts contain no raw network/HAR/trace proof of account/recovery transport privacy. A subsequent direct-runner transport packet supersedes the three failed CLI attempts within a cachedb6-backend scope:673 requests and36 inspected public/nonowner API bodies have zero literal known-fixture email/raw-key URL/Referer or public-body matches; protected own APIs return200 private/no-store and343 RSC responses have no-store headers, with RSC bodies unread. Own email in authenticated board HTML is expected and private/no-store; dummy recovery uses no-referrer and no observed downstream literal token. Baseline author10/player2 sessions remain unchanged after own logout204. Matching is literal, not an encoded/unknown-secret guarantee. Four mocked Explore default24 checks render24 cards at390/1440 with programmatic card focusability/href and scrolling, no overflow/errors and measured long tasks; APIcap100 is not the ordinary UI page size. Full lifecycle/export/RSC-body coverage, actual delivery/media/concurrency/SLO, the standalone email-query decision and target ingress/provider behavior remain open. Exact44 source gate and canonical-origin refresh pass; no section76 closure.
- [x] 77. HTTP STATUS CODES — Verified before deployment: the root's intentional 307 redirect resolves to canonical Discover HTTP 200; direct valid and missing pages return 200/404, trailing-slash normalization returns 308 with the query preserved, a guest on protected API routes receives 401 with a Session challenge, and authenticated forbidden or CSRF-invalid requests still receive 403. Real-domain edge status handling remains for rollout.
- [ ] 78. REDIRECTS — Partial: login/logout, root, and trailing-slash redirects work with preserved query and no loop; public HTTP→HTTPS, host alias, and legacy URL policy need a domain.
- [x] 79. STATIC ASSETS — Verified before deployment: production candidate icon/social/static assets, normalized images, protected ZIP downloads, branding and case-sensitive routing were observed; external fonts, PWA manifest and standalone static documents are absent.
- [x] 80. PUBLIC FILE EXPOSURE — Verified before deployment: current production server returned 404 for environment/Git, SQL backup, SQLite, private key, log and internal Next server probes; release image/context guards exclude sensitive files. Target edge/bucket smoke remains a rollout gate.
- [x] 81. SOURCE MAPS — Verified before deployment: private map policy, production-image file inspection, HTTP probes, and CI guard.
- [x] 82. API READINESS — Verified before deployment: the API verification matrix maps validation, authentication/authorization, quotas, schemas/errors, pagination, bounded bodies, safe logging, secret exclusion and required idempotency. Native client20s and SSR4s body deadlines, upload120s guards and actual Nginx10/60s upstream-read observations cover applicable local request paths. Real provider/edge capacity and deployment checks remain separate.
- [ ] 83. CORS — Partial: QA preflight allows its configured origin with credentials and denies an outside origin; production rejects wildcard, HTTP, and local CSRF/CORS origins; staging target remains unspecified.
- [x] 84. FEATURE FLAGS — Verified before deployment: complete runtime feature inventory, development-only Agentation, production debug/seed rejection and server staff permissions; remote flags are absent and no unfinished feature CTA is exposed.
- [x] 85. DEBUG ARTIFACTS — Verified before deployment: runtime source and production build reviewed for console/debug/TODO/mock/fake-auth/seed/credential artifacts; retained local defaults are guarded development/configuration values rejected by production checks.
- [ ] 86. TEST / DEMO ACCOUNTS — Partial: deterministic `.test` fixtures and elevated E2E moderator cannot be created by the seed command under production settings; verify the target database has none and is isolated from staging. Payments are absent.
- [x] 87. ADMIN PANEL — Verified before deployment: known admin URLs reject guests/nonstaff; installed Django active/staff permissions, moderation audit, bounded search/pagination, hard-delete guards and confirmations have source/test/HTTP evidence. Populated multi-page rendering and target access controls are not claimed.
- [ ] 88. SUPPORT — Partial: local evidence recorded; review remaining original bullets.
- [ ] 89. LEGAL / BUSINESS FOOTER — Partial: Privacy, Terms, Cookies, and current-year footer verified; a private contact and real operator/legal identity still need user-provided details and review.
- [x] 90. FOOTER — Verified before deployment: current-year branded footer, five working internal links, contact destination page, intentional cookies anchor, responsive layout, and no broken placeholders; official social accounts are not configured for this release.
- [x] 91. PAGE METADATA — Verified before deployment: exactbb4 production image serves seven static public routes and filtered Explore with query-free canonical/Open Graph URLs and preserved title, description, image dimensions/alt, Twitter and favicon head metadata. The observed NODE_ENV=production image uses the synthetic staging CI origin;28 metadata cases, the live head loop at retry0 and all12 CI jobs pass. Earlier dynamic bingo/profile/share observations retain their scopes; public-domain/social-provider rollout remains separate.
- [ ] 92. FAVICON SET — Partial: ICO, SVG browser icon, and 180px Apple touch icon return 200 and appear in page head; native dark browser chrome is captured, but visibility in both light/dark chrome remains unchecked. PWA is absent.
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
- [ ] 104. ROLLBACK — Partial: additive migrations and an existing-data downgrade/upgrade rehearsal support backward compatibility; no remote feature flags exist. The isolated immutable c1fc2d7/a3e1c00 backend rehearsal restores old web while retaining forward schema/new worker and checks durable records plus existing/fresh sessions. Its sanitized artifact and reusable command are saved; actual prior deployment, registry/config retention and the target-platform rollback command remain unproven.
- [ ] 105. FINAL EXECUTION SEQUENCE — Partial: sourcea2c2d6f passes the complete CI gate and a bounded exact-image registration/player/report/cache packet; earlier configured065 checks retain their scope. Remaining applicable local requirements and the target deployment sequence stay open.

Current follow-up evidence adds one verified isolated native Chromium149 password-
manager seed and Change email current-password autofill with intended new email
preserved; other forms remain unverified, with no product defect or section7
closure. Thirty-six actual account-control visual states include true Tab focus,
hover/press/pending states, with no overflow/clipping; width/feedback placement
choices remain pending. Optimized44 lacks pending export live feedback. A narrow
aria-live/aria-atomic source patch passes43 account tests, typecheck/scoped
lint/format and independent review; actual3194 development DOM/AX shows polite,
atomic pending feedback and unchanged styles/geometry. This is not a new optimized
image, final source gate, deployment or screen-reader speech verification.
Three repeated maximum24 mocked Unicode/shared-media controls show layout-dominant
~300ms long tasks. The subsequent one-declaration content-visibility:auto preview
fix reduces candidate maximum Layout to30–41ms, with no recorded long tasks during
eight jumps/run. A24-flow Chrome/Firefox/WebKit matrix and dense-preview regression
in all four configured profiles preserve content/scroll/focus/resize behavior;
raster/native Find/assistive-technology and real-device/SLO limits remain. Final
source625 unit tests, typecheck/lint/format pass; optimized image remains44 and
committed034 CI excludes these later CSS/export source/test changes.
GitGuardian check113571385792 on committed034 reports FAILURE with6 findings
across123 commits and0 API annotations; details are dashboard-only and remain
unverified pending user-provided findings. Repository secret CI passes; the older
single proven fixture false positive cannot classify these six findings.

## Remaining local and operator work

Section76 now has scoped direct-runner public/nonowner body, protected own-cache
and dummy-recovery URL/Referer observations; the three failed CLI attempts remain
historical. RSC bodies, encoded/unknown-secret matching, real recovery lifecycle,
exports and target ingress/provider delivery remain unverified. Default24 Explore
client rendering has bounded mocked-delivery evidence; actual wire/media/default
feed SSR, repeatability and agreed performance targets remain separate. The
standalone email-query choice,
recovery-link/session/chip layout choices and both-theme native favicon visibility
remain unresolved. Continue the applicable unchecked bullets with their recorded
source/runtime limits; domain, delivery, ingress/cache and provider evidence
require the real deployment or operator inputs. Committed034 CI and the earlier canonical
header-flow refresh are complete. The subsequent export live-region and preview CSS/test patches still
need their final committed-source gate/optimized verification. GitGuardian findings
need dashboard details and classification; no production-secret status is inferred.

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

### 2026-10-09 — Additional optimized local evidence

Optimized local ec69223 confirms the export preparation live-region metadata
and completion at320/1710 (15 verified hashes; synthetic APIs, no speech or real
export/backend claim). A separate Discover page2 held-response probe confirms
card removal and premature scroll clamping at1440/390 (22 corrected verified
hashes); the loading UX choice remains pending. Stable landmarks and raw
excluded-input layout-shift observations are not field CLS proof. See the
[dated optimized evidence](production-readiness-evidence.md#2026-10-09--optimized-ec69223-export-announcement-and-pagination-loading).
No checklist/section counts change; committed034 CI does not cover these later
source changes, and these local observations do not certify deployment.
