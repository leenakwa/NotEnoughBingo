# Local release assessment — 2026-09-29

The [complete production-readiness prompt](production-readiness-prompt.txt)
and its [105-section tracker](production-readiness-tracker.md) are the scope for
final sign-off. This report records local evidence only; it does not claim that
every checklist item has been verified on a public deployment.

Latest completed committed-source gate: exact
`d5fe818a2e815c211202f8c1032aceb564a91ff0`
[CI37879694946](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37879694946)
finishes SUCCESS with all12 jobs, including both production images and Release:
471 backend, Node22.23.3 frontend666/46 files (all49 editor cases),591 expected
browser passes,12 intentional skips, zero unexpected cases and zero flakes.
Chromium passes119 smoke cases, each other profile115/four skips; full-stack127.
The accepted-response PNG export recovery case passes at retry0/2898ms: real
backend202 is replaced with browser503, then explicit retry reuses the same key
and job, completes a PNG-signature download and performs no draft writes. The
original PNG bytes were not separately uploaded. Together with the49 editor
cases and prior form-lock evidence, this closes duplicate-submission item27 for
these observed editor/form paths. Understandable-error item25 remains open for
the user's stale-revision message choice; section1 remains Partial.

Source and tested merge `f149faa0369c8ed2cb80b5e9b10bac40edb7fe2d` share full tree
`91efeaf035dd4e632ab5cd189675565d2f5189a2`. Root independently verifies47 retained
manifest hashes, all nine fresh artifact API digests against original bytes and
fresh Git API tree identity. Archive-agent integrity checks pass separately;
root did not rerun ZIP CRC. Logs/artifacts remain sealed privately in
`evidence-d5fe818-2026-10-09/ci` with separate root verification record
`evidence-d5fe-root-final-verification-2026-10-09.json`.
See the [datedd5 gate](production-readiness-evidence.md#2026-10-09--completedd5fe818-source-export-recovery-and-anonymous-auth-cache-gate).

Actual backend image HTTP stdout verifies production settings, DEBUG=false and
its default Gunicorn entrypoint: anonymous GET auth/me401, CSRF-rejected POST
login403 and missing auth route404 each have `Cache-Control: private, no-store`;
a non-auth missing route404 has no Cache-Control header. Runtime middleware hash
matches committed source. Image is
`sha256:ed2636afafac85e0447eacdb3c8632ebc44ebbdc19e60d3ba26ca267b28dd817`;
APP_RELEASE is probe-supplied, not embedded-release proof. This establishes four
anonymous/rejection/unmatched-route HTTP outcomes, not successful authentication,
DB/Redis, TLS, shared caches or public ingress. Section59 remains Partial.

Optimized frontend metadata passes eight200 heads/128 assertions; all28 metadata
unit cases and the live public-head loop at retry0/8811ms pass. Original JSON
identifies image
`sha256:568586d8483e15eb4196f32ee3be56d625293adf0c622509d8102f52d7daf527`,
NODE_ENV=production, staging environment, embedded mergef149 release and synthetic
`https://ci.not-enough-bingo.invalid` origin. Successful steps require removal of
their owned containers; no independent post-removal listing is retained. This
retains ID994/section91 Verified before deployment. Metadata heads do not prove
functional backend or optimized feed/media/browser runtime behavior. The prepared
next gate transfers the optimized frontend image into the full-stack job and
adds four guest SSR/hydration/search cases against its existing development
backend. These uncommitted runtime checks are unexecuted. Runner cancellation
fix review passes10 mocked and six signal checks, not actual Docker cancellation.
An old-query Explore GET is confirmed; the uncommitted source correction passes
13 scoped tests (before correction: six failed/seven passed), full typecheck and
target lint/format. Independent scoped source/test review passes; actual
optimized browser execution remains unverified. Bullets881/882 remain open. Current totals:822 checked/320 unchecked,
89 release-scoped N/A/231 applicable;58 Verified/40 Partial/6 N/A/1 deployment-only.
Installed Gunicorn26.2.2 OSV guard passes; the ordinary full PyPI audit still
explicitly skips it. No undisclosed-vulnerability guarantee follows.

Historicald515 [CI37878186145](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37878186145)
remains FAILURE: ten jobs succeed, full-stack/Release fail;469 backend,666 frontend,
590 expected browser passes/12 skips/one unexpected/zero flaky. The global alert
locator failed before retry/download assertions; its original trace, artifacts,
46 retained hashes/nine digests and tree `05c30f51fb78e7e70755e81337c9c555e4758e5d`
remain retained. The scoped alert fixture and auth-cache probe now have actuald5
execution above; the failed result is not relabeled successful.
Historicalbb4 [CI37875904112](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37875904112)
retains all12 SUCCESS,469 backend/655 frontend/590 browser passes/12 skips and
shared tree `6fbd557c5d388d7dd8713d0b150a45fe05e83f1b` in the
[datedbb4 gate](production-readiness-evidence.md#2026-10-09--completedbb4ae86-source-and-rendered-metadata-gate).
Cached local frontend ec69223/backend b6aabca/worker a3 and keepalive0 observations
retain their separate source/runtime limits.

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
Historical84/bb4 backend469 and latestd5 backend471 pass under locked dependencies,
including all16 cache cases. The laterd5 production-image anonymous rejection/
missing-route probe above passes; successful-authentication and public-cache
transport remain unverified. A subsequent single
post-reset login returns200 with33 fresh upstream connections/zeroRST and stable
worker snapshots; original500 cause remains unknown. Section59, expired-links
ID569 and section76 remain open; counts and checkbox states are unchanged.

Currentd5 external GitGuardian check113656303870 remains FAILURE: six occurrences/
four incidents over134 commits. This is separate from the green Release job;
provider spans, reuse and disposition remain unresolved. Historicald515/
bb4/605/991/e8/84/188 metadata is retained.

The [committed preview projection](production-readiness-evidence.md#2026-10-09--preview-ssr-unused-field-projection)
removes only unused position/image_asset_id fields from feed/Explore SSR preview
props. Thirty-six focused server cases, full typecheck, scoped lint/format and
independent source review pass. Actual source-bound development pages retain the
raw API content except those fields: normalized JSON34,709→31,642 bytes for five
boards/77 cells on each route. Narrow/wide layout and first-card navigation pass;
network capture is unavailable, so no new zero-initial-feed-request claim follows.
This patch is included in e8/991/bb4 and latestd5 CI, including all seven projection cases. Its
actual development-media observation remains separate; no optimized browser
runtime, wire/gzip or latency proof follows. No checkbox/count or section verdict
changes follow.


The current representative native Chrome154/macOS200% packet verifies the
original zoom requirement with guest/authenticated views and readable keyboard
focus on exact44 frontend/cachedb6 backend, supplemented by source-equivalent
historical observations. Owned fixtures are guardedly soft-deleted, own session
revoked, and baseline profile/ten-session IDs preserved; revisions/analytics remain.
Section24 is Verified before deployment; checklist822/320 and section totals
58 Verified/40 Partial/6 N/A/1 deployment-only follow from the original bullets.
Of320 unchecked bullets,89 are release-scoped N/A:85 in the six N/A sections
plus four absent-feature conditions (product WebSockets, invitation/receipt
emails and payment-webhook alerts), confirmed by source inventory and independent
review.231 applicable unchecked bullets remain. Four implemented email-type
functional checks and the two local restore-procedure checks have separately
reviewed evidence; applicability reconciliation itself changes no checkbox or
section verdict.
Section76 remains Partial: canonical guest URLs and unchanged-source privacy
contracts have bounded evidence, but archived CI reports contain no raw transport
captures and cannot prove account/recovery headers, response projection or Referer
isolation. A later direct-runner packet supersedes the three failed CLI attempts
within its cachedb6-backend scope:673 requests/36 public-nonowner API bodies show
zero literal known-fixture email/raw-key matches in public bodies or URL/Referer;
protected own APIs return200 private/no-store and343 RSC headers include no-store.
RSC bodies are unread. Own email in authenticated board HTML is expected and
private/no-store. Dummy recovery is no-referrer with no observed downstream literal
token; own logout204 preserves author10/player2 baseline sessions. This does not
prove encoded/unknown-secret absence, real-token lifecycle, exports or deployment. A separate isolated101-board packet records42 HTTP200 responses:
catalog requests100/101 return100 cards/10,000 cells, while feed100 returns24.
Catalog ASCII/Unicode/shared normalized-media examples measure6,729,104/
15,282,104/17,714,004 rendered JSON bytes (offline gzip6:2,129,922/476,862/
530,464), with5/5/12 SQL queries. These scoped examples are not absolute legal
maxima, wire/CDN, browser or production concurrency/SLO evidence. The email-query
choice and target ingress/provider behavior remain open. Four mocked Explore
client checks consume the actual default24 payload size, render24 cards at390/1440
and pass scroll/programmatic card focusability/href, overflow and error checks.
Programmatic link.focus() does not prove Tab traversal or keyboard navigation. JSON read/parse is
3.6–3.9ms for ASCII and18.3–18.4ms for shared-media Unicode; single-case observed
completion148.5–477.8ms includes layout/automation, with long tasks observed.
These are bounded local mocked-delivery measurements, not feed SSR, actual board
navigation/media/wire, isolated normalization, repeatability or production SLOs.
No mandatory reduction, product failure or global production-readiness claim
follows from these local results.

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

Native Chrome154/macOS200% is observed in an owned Guest window on
localhost18584 with cached frontend05d148a/backendb6. Guest discovery/play and
login/registration controls, authenticated settings/editor and recovery
readability, and visible keyboard focus have bounded evidence. Application
source excluding tests matches5f; this is not a latest-image run. No settings
write request is sent. One new owned autosaved draft is undone and guardedly
soft-deleted; its histories remain. Own logout revokes only its session while
all ten baseline active-session IDs/profile values remain unchanged, but opens
an unexpected expiry auth dialog. The subsequent source fix above passes scoped local browser
regression; the bounded current-frontend rerun below verifies own logout.
The earlier cached-image packet remains historical evidence. Chrome Reset
confirms100% and only the owned Guest
window closes. Wrapped recovery-link layout and CSRF-copy choices remain
pending. Report zoom is subsequently observed within the bounded rerun below;
other-form/other-engine/device zoom, exact CSS viewport and
both-theme favicon visibility remain unchecked. The subsequent representative
native44 packet closes the original zoom bullet and section24; exhaustive zoom
coverage is not claimed.
Support-placeholder delivery remains an operator check. See the dated evidence
ledger and accessibility matrix for full scope and cleanup limits.

Current frontend native rerun —2026-10-09: Chrome154/macOS at actual200% on
exactc74 frontend/cachedb6 backend observes report readability/focus wrapping and
own logout settling on `/login` without an expiry dialog. Owned-session revocation,
ten-session/profile preservation, Reset100% and owned-window closure are confirmed.
See the [dated evidence](production-readiness-evidence.md#2026-10-09--current-frontend-native-chrome200-report-and-own-logout)
for runtime/proof limits. The later representative native44 packet extends flow
coverage and verifies section24; exhaustive device/engine coverage and section92
remain open.

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

Earlier green gate —2026-10-08: Exact `38fd3d1`
[CI37829451235](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37829451235)
passes all12 jobs:446 backend,619 frontend/44 files,380 smoke/12 intentional skips
and125 full-stack cases, with no reported flakes/retries. Both images and Release
pass. Extended avatar failure/retry and all eight Retry/Resend cases pass. Branch
and tested merge share tree `28bf9d654eef1378420b357e127bd928d5285fd8`; original
logs/artifacts/metadata/checksums are archived privately. Earlier a164 fixture
isolation passes the combined registration/email-change/deletion/avatar suite
without relaxing production limits.

A subsequent bounded packet captures frontend upstream socket reuse, backend RST
and matching unread-count proxy500 near five seconds. A disposable keepalive0
backend eliminates reuse:27 requests use27 connections with FIN/noRST; all seven
threshold requests return401. The next backend image closes internal connections
to avoid this mechanism. This also removes Nginx-to-backend reuse: actual target
latency, connection churn and sustained throughput require deployment measurement.
The cold/unequal clone latency sample is not a capacity result. The subsequent761
gate builds both images but fails two full-stack tests; the corrections
subsequently pass exact0d CI. No production
deployment or broad readiness claim follows.

Earlier observation —2026-10-08: Exact `678240f` [CI37821941465](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37821941465)
again fails full-stack and Release with ten jobs passing. Full-stack records124
passes/one failure: new avatar validation/retry, confirmed deletion and guest
token-only registration recovery pass; existing token-only email-change setup
verification receives429. Moderator bootstrap isolation is insufficient; the
failure trace is HTML429 from Nginx, without Retry-After or a structured Django error.
Full inventory finds only three moderator verification attempts; the five/hour
Django quota does not explain this response. Dedicated seeded actor isolation is
prepared and passes local checks/review; its exact integration gate is pending. Application
limits/recovery assertions remain unchanged; this is not a passing release.

Earlier observation —2026-10-08: Exact `a55a2b1` fails the full-stack and Release
jobs in [CI37818441348](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37818441348).
Ten jobs pass:446 backend,619 frontend and372 smoke cases/12 intentional skips;
full-stack records123 passes and one failure. The new confirmed-account-deletion
browser case passes. The existing token-only registration retry receives an actual
429 after its controlled503: the trace records `throttled` and Retry-After3321.
Source inspection identifies six serial anonymous verification/resend requests
against the shared five-per-hour quota, including the added deletion bootstrap;
the recovery retry is sixth. Exact cache history was not captured; trace and source
inventory support fixture interference with high confidence. Test bootstrap
isolation is being corrected; application limits and original
retry assertions are unchanged. Tested merge `8280dd4f708197e77a610bc98c8a3ffc0dbdfc4e`
shares full tree `6b844bdbeacead90a344bf5f477c2f638e5e2524` with the branch.
The failed run and trace are preserved; a passing earlier gate does not cover
this source. No deployment or readiness claim follows.

Earlier green gate —2026-10-08: Exact `71a22ec` passes all12 jobs in
[CI37812635002](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37812635002):
446 backend,619 frontend,372 smoke/12 intentional skips and123 full-stack
cases, with no reported smoke flakes. Both images and Release pass. Tested
merge `4fee4631be30def169f928d3d6c2897ba59dda5d` shares full tree
`dffb093a6f367da550504c7f27472a2133655e51` with the branch. This docs-only
gate retains the previous application source. Subsequent unpublished-draft
projection verifies nine bounded owner/guest/unrelated API/HTML/navigation-RSC
controls; six CDP body-read errors and30 request failures retain its failed
clean-flow/wrapper verdict. A separate38-state account geometry packet records
notification/session/export at320/1710px without measured clipping/overflow;
status-space/session-width choices await the user. Its20 request failures/four
console errors retain failed clean-flow/wrapper verdicts. Both packets verify
exact owned cleanup. No broad privacy/control closure or production readiness
follows; these subsequent observations are recorded in the working documents.

Earlier observation —2026-10-08: Exact `b04fcad` passes all12 jobs in
[CI37806507157](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37806507157):
446 backend,619 frontend,372 smoke/12 intentional skips and123 full-stack
cases, with no reported smoke flakes. Both images and Release pass.
Tested merge `6fa0f642403fb1cde3a528dbbf27e6803811cd9f` shares the full
`53e9a4359bc76afa25f45add2e6fe2917aa4efb0` tree with `b04fcad`.
This docs-only commit retains the previous activation source; the earlier
WebKit crash remains recorded rather than explained by this passing run.
A separate disposable25-board profile packet verifies actual API pages24+1
and Next/page2/Previous/page1 at320 and1710px. Pagination disappears during
loading; its UI treatment awaits the user.39 unattributed request aborts
prevent a clean-network claim. Owned data/session cleanup is verified.
A subsequent hidden-bio packet verifies owner-positive/guest-unrelated-negative
API, raw HTML and actual gzip-decoded navigation RSC projection (nine bounded
controls). Its clean-flow verdict and wrapper remain failed because six CDP
body-read errors and37 request failures are retained. Owned cleanup passes;
Flight decoding, all privacy fields and production cache behavior are unproved.

Earlier observation —2026-10-08: Exactbc38a5a passes all12 jobs in
[CI37802454204](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37802454204):
446 backend,619 frontend,371 clean smoke/one recovered WebKit flake/12 skips
and123 full-stack cases; both images and Release pass, with matching full
tested/branch trees. The first reset-password trace records a WebKit
network-process crash and failed second document; navigation/hydration
provenance remains unproved. No assertion or timeout is relaxed.
This gate covers the activation-validity correction. The instrumented local
fetch packet observes23 fulfilled promises despite17 CDP aborts; body
completion/native cancellation attribution remains unproved.

Earlier observation —2026-10-08: Exact7534134 passes all12 jobs in
[CI37799307071](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37799307071):
437 backend,619 frontend,372 smoke/12 intentional skips and123 full-stack flows;
both images and Release pass, with matching tested/branch full trees. This
includes committed deterministic session/cookie expiry coverage. A separate
real Redis/PostgreSQL probe verifies natural local expiry; native/deployed
expiry and the final login-duration decision remain open. Read-only CDP
contrast rules out Playwright interception as a necessary cause of observed
post-header aborts, but their cancellation mechanism remains unproved.

A subsequent activation-validity patch rejects START without a board and
excludes historical unbound starts from cohort activation. It passes28 local
PostgreSQL cases and independent correctness review; the laterbc38a5a source
gate above passes. The metric still counts client-reported starts.

Earlier observation —2026-10-08: Exact b6aabca passes all12 jobs in
[CI37796382333](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37796382333):
435 backend,619 frontend,372 smoke/12 intentional skips and123 full-stack flows;
both images and Release pass, with matching tested/branch full trees. Local
frontend retains actual05d identity/source equivalent to b6; backend runs exact
b6, both non-root/healthy. The bounded actual API/HTML projection packet has
meaningful owner-positive/guest-other-negative private-board controls and
matching authorized API/client props, with its stated fixture/surface gaps.
Subsequent deterministic expiry coverage passes18 cases on isolated PostgreSQL
and independent review; the later7534134 gate above covers these tests. Final login
duration remains a user choice. A later isolated real Redis/PostgreSQL probe
observes natural four-second expiry and rejects a retained cookie; local library
versions differ from pinned runtime. Native/deployed expiry remains unproved.

Earlier observation —2026-10-08: Exact5ed50c0 passes all12 jobs in
[CI37790158585](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37790158585):
423 backend,610 frontend,372 smoke/12 intentional skips and123 full-stack flows;
both images and Release pass. Tested merge and branch full trees match. The
configured optimized pair has matching5ed release identities and real guest/auth
GETs retain full revisions/catalog previews while removing duplicate detail
preview. Backend still uses local fixture development settings.

The slim-preview-media patch also passes46 scoped backend and610 frontend
cases, lint/types/format/schema checks and independent review. One isolated
maximum-field shared-media fixture measures default24-card JSON falling
5,140,890→4,246,290 bytes, approximately17.40%, while retaining complete cell
content/styles and full detail media. Responses remain large; PostgreSQL distinct
media scalability, ingress compression and target latency are not proved. This
new patch has the complete gate above; the later two clipboard/share failure
unit cases require their own final committed test gate. Follow geometry has scoped
seven-context stability evidence, with one unexplained session proxy500 retained.

Subsequent optional-analytics construction guard passes seven regression cases,
independent review and final frontend lint/types/619 cases/format. Its five
fail-before cases establish the synchronous UUID failure. The original browser
packet used an untrusted HTTP origin and failed before feedback interactions;
its evidence is retained. Updated image/browser and complete new-source CI remain
required. No production HTTPS failure or readiness is inferred.

The later profile shared-result filter correction has eight actual API failures
before and14 scoped cases passing afterward, plus independent security review.
It removes withdrawn-board metadata from guest/other profile listings while
preserving owner/public/unlisted behavior; its new committed-source gate and
configured backend image remain required. Trusted-localhost shared feedback
verifies controlled recovery and5.1-second persistence but fails strict network
checks; its offscreen message placement awaits a user choice. Profile loading
measurements retain fixed tabs, unexplained background aborts and a pagination
fixture gap. Neither browser packet establishes a complete pass.

Earlier observation —2026-10-08: Source `a2c2d6f` passes all nine jobs in
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
A later single a2 RSC flow reads all17 observed bodies to EOF while CDP marks9
requests canceled, including the clicked navigation. The grid renders with no
page/console errors; transport/capture causation remains unproven.

The [exact configured image](artifacts/explore-pending-submission-2026-10-08.json)
passes nine controlled Explore guard cases in three engines and eight real-API
guest initial-layout observations at390/1710. Release identity matches, no app
mounts, health200. Seven CLS0; mobile game0.00068559; board dimensions stable,
no overflow/pageerror/console warning/error. First frames may follow hydration.
118 RSC GET aborts remain unexplained; this is not a global layout/CWV verdict.
Previous992 report image passes five affected real product flows and native
modal/clipboard checks; eight controlled modal cases pass separately. Earlier5e
proof remains scoped to156 native and nine API/SSR cases. Accepted wrapping,
mobile grid-first layout, board-width font scaling and single backdrop remain.
The [Nginx probe](artifacts/nginx-upstream-deadlines-2026-10-08.json) verifies local
10/60s upstream-read deadlines and safe504 recovery.

[Native keyboard proof](artifacts/native-form-keyboard-2026-10-08.json) adds
30 social form walks at320/1710 across three engines and three Explore cases.
Enter/Tab and own-form submission now map across14 form kinds using prior
auth/profile/account evidence; intercepted social400 responses do not establish
persistence. Corrected WebKit keyboard opening returns report focus; its separate
pointer opening leaves BODY focused, with the intended focus policy undecided.

The subsequent cache-readiness correction has13 passing scoped observability
checks and independent review. Its388-test Python3.13/PostgreSQL job passes;
the complete ceb source gate passes. Earlier configured frontend observations remain scoped to065.

At that checkpoint:816 checked/326 unchecked;58 verified/40 partial/six N/A/
one deployment-only. Of326 unchecked bullets,85 belong to the six explicitly N/A sections;241 are
applicable. The42 final-execution bullets overlap earlier checks. These counts
describe evidence, not independent tasks or a product-readiness percentage.
The [tracker](production-readiness-tracker.md) and
[dated evidence](production-readiness-evidence.md) contain scope and open items.

## Decision

Source5ed has the complete source gate summarized above; the subsequent
shared-link failure coverage still requires its own final committed test gate. Source a2 has historical evidence for
registration metadata, private-response
caching and development/framework logging corrections. Scoped checks and
independent review pass. Its exact optimized packet passes registration/player/
report and actual private/public cache header checks.
Reachable registration email-query behavior, CSRF copy and other UI choices
remain open. Current dev registration stayed disabled in its observation;
optimized a2 registration passes separately without proving that cause. Historical
configured proofs retain source065.
Target operator/support/legal
choices, services, TLS/ingress, secrets, monitoring, CDN/capacity, native-device
checks and off-site recovery remain to be verified. No production registry
promotion or public deployment has occurred. See the
[deployment baseline](production-deployment.md).

The sections below retain the2026-09-29/30 baseline. Their old dependency versions,
counts and interface observations do not describe the latest source; later
explicit user choices and dated evidence supersede them.

## Test environment

- An isolated Compose project, `nebqa`, ran on `http://localhost:18080` with
  separate PostgreSQL, Redis, MinIO, and Mailpit volumes. Existing project
  volumes were not used. Browser fixtures were synthetic accounts and boards.
- On 2026-09-30, a second clean Compose project, `nebseaqa`, ran the new
  SeaweedFS S3 override with separate fresh volumes. Its 28 live browser
  scenarios passed; the temporary project and volumes were then removed.
- Docker images used freshly pulled `python:3.13-slim` and `node:22-alpine`
  bases. These mutable tags are only inputs to the local check; record and
  promote immutable release image digests after CI succeeds.

## Historical local baseline

| Check | Result |
| --- | --- |
| Docker Compose configuration, shell scripts, Nginx syntax, workflow lint | Passed |
| PostgreSQL migrations and missing-migration check | Passed |
| Backend Ruff and mypy | Passed |
| Backend tests on PostgreSQL/Python 3.13 | 119 passed, 1 skipped; coverage was measured before the newer language, reset-limit, media-message, and email-change tests (79.27% then) |
| Generated OpenAPI and TypeScript types | Match checked-in artifacts under PostgreSQL/test settings |
| Frontend ESLint, TypeScript, Prettier, production build | Passed with Next.js 16.3.7 |
| Frontend component tests | 67 passed |
| Browser smoke suite: Chromium, Firefox, WebKit, mobile | 50 passed, 6 intentionally skipped (geometry checks use Chromium) after editor-grid ARIA fix |
| Live Chromium and mobile WebKit full-stack flows | 28 passed on the clean SeaweedFS stack before the session-status change; 28 passed on the existing isolated QA stack afterward, including a two-width route audit, accessibility, and account settings/email change |
| npm audit, pip-audit | No known vulnerabilities in the audited dependency graphs |
| Trivy on both production images | No fixable High/Critical findings with refreshed base images |
| Gitleaks committed-history scan | No leaks in 16 commits |
| Production image users | Backend `app`, frontend `nextjs` |
| Current production frontend startup | `/api/health`, `/confirm-email-change`, `/create`, and `/robots.txt` returned 200; missing bingo returned 404 |
| Public ingress probes | Nginx, frontend, Django liveness/readiness, Beat, robots, sitemap, and Open Graph image returned 200 |
| Production frontend axe scan | No automated violations on Discover, Explore, Login, Register, or Support |
| Local PostgreSQL backup/restore drill | Checksum passed; 4 users and 5 boards before and after; readiness passed |
| Local media restore drill | Unique object copied to a temporary MinIO bucket, deleted from primary, restored, and SHA-256 matched; same instance only |

The backend Nginx-template assertion skips inside the backend container because
the infrastructure file is outside that image. The separate infrastructure
checks validate the template and rendered Nginx configuration; on a full
repository CI checkout the assertion runs normally.

## Historical user-path notes

- Guest discovery and Explore showed public boards; a guest like led to Login
  with a return URL. At 320 px, sampled Discover and Support pages had no page
  width overflow.
- Login opened the account profile. A data export completed, downloaded as a
  ZIP, and passed archive integrity validation.
- Account deletion required a password and confirmation, signed out the test
  account, allowed login during the grace period, and could be cancelled.
- The live suite exercised email verification, draft save and publish, guest
  and registered play, sharing, comments, likes, follows, reports, moderator
  action, and public/unlisted/private boundaries.
- The new-user browser flow prompted for preferred bingo languages and saved
  them. In the editor, direct cell typing and title/language publication checks
  worked. Discover and Explore language filters, separate profile drafts, and
  cross/diagonal play marks were checked in the local browser. Existing boards
  have language `und` until their authors select a language and republish;
  language-filtered feeds exclude them by design.
- Account recovery was exercised through a real local email, including an
  offline request, session revocation, token reuse, and a new login. Missing
  public resources now return real 404 statuses. Two-tab logout removes stale
  private UI; expired sessions return to the editor after login and restore
  unsaved text. An offline editor edit persisted after retry and refresh.
- Invalid media uploads show specific user-facing messages. A production
  frontend image now requires an explicit HTTPS public origin and passed a
  separate local startup check with a non-deployable CI origin.
- Notifications, profile language/privacy preferences, and long multilingual
  profile content were verified in the browser. A new email-change flow
  requires the current password and confirmation through the new inbox;
  Mailpit received notices at both old and new addresses.
- A shared result from an earlier public revision now becomes inaccessible to
  visitors when its bingo is made private. The API regression checked 200
  before the change, 404 afterward, and continued owner access.
- The production frontend image now fails to build without a valid support
  email. A local image built with a CI-only address rendered that `mailto:` on
  `/support` rather than the public issue tracker. A real monitored inbox is
  still a launch gate.
- Seventeen guest-facing routes plus signed-in Profile, Notifications, and
  Create returned expected page statuses without JavaScript errors, 5xx
  responses, or horizontal overflow at 320 and 1710 pixels. Account settings
  passed the authenticated serious/critical axe gate.

## Remaining launch gates

1. Require every release-gate job to pass for the final source. Production
   publication, signing/attestation, digest promotion and platform rollback need
   a target deployment and authorization.
2. Configure the actual operator name, private monitored support address, and
   review the Privacy Policy, Terms, and moderation process for the deployment.
3. Provision and test the production domain, TLS edge, trusted proxy CIDR,
   staff access gateway, secrets, managed data services, object storage,
   transactional email, telemetry, and external synthetic checks.
4. Perform a full off-site PostgreSQL **and media** recovery drill. The local
   exercises validated same-machine database and media recovery only.
5. Measure load, latency, queue age, and restore time against explicit launch
   targets using the real deployment topology. These were not measured here.

The new guest-safe `/api/v1/auth/session/` status endpoint removed the observed
403 resource entries from a fresh guest `/discover` page while keeping
`/api/v1/auth/me/` protected. Recheck the production console on the final
domain; the local QA browser is not production evidence.

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

### 2026-10-09 — Public Open Graph URL gap

Earlier gap/preparation evidence follows. Its pending rendered gate and section91
state are superseded by the completedbb4 reconciliation below.

Committed6050e9e and the installed Next16.3.8 resolver show missing `og:url` on
Discover, Explore, Trending, Privacy, Terms, Community Guidelines and Support.
Their canonical paths do not implicitly populate the Open Graph URL. Dynamic
bingo/profile/share routes already set it. Earlier all-public-route URL evidence
is superseded for these seven routes; section91 is Partial and its URL bullet is
reopened pending actual rendered production-head verification. The working-tree
correction preserves existing metadata defaults and passes28 host Node24 tests,
full typecheck, targeted lint/format and independent review. One development
head loop is discovered, not executed. The additive exact-built-image probe
passes parser/mocked-cleanup/Ruff checks but has not executed against Docker.
The next exact-source CI must run both rendered gates.
At this gap checkpoint, counts were822 checked/320 unchecked, including89 release-scoped N/A and
231 applicable;58 sections Verified/40 Partial. Social-provider caches still
require a real deployment. No copy, design or indexing policy change is selected.

### 2026-10-09 — Editor export retry idempotency gap

Committedbb4 creates a fresh export key after a lost accepted POST response or
polling exhaustion. Backend deduplication is per owner/kind/key; the fresh key
creates another job and queued render. This is a frontend retry defect, distinct
from backend duplicate-delivery protection or intentional new exports.
The duplicate-submission bullet is reopened and section1 becomes Partial.
At reopening, counts were821 checked/321 unchecked,89 N/A/232 applicable;57 Verified/41
Partial sections. The laterbb4 metadata closure restores822/320 and58 Verified/40
Partial, while ID27 remains open and section1 Partial. The reviewed working-tree correction retains uncertain keys
and resumes known jobs, clears definitive failure/session/target boundaries and
preserves current UI. Host49 editor cases pass, including three regressions that
failed before the fix. Actual next-source Node22/browser verification is pending.
The completedbb4 source gate below includes the eight rendered production-image
heads and closes ID994/section91. This supplies no execution proof for the later
export fix or its discovered-only live recovery case.

### 2026-10-09 — Completedbb4 metadata gate reconciliation

The [datedbb4 gate](production-readiness-evidence.md#2026-10-09--completedbb4ae86-source-and-rendered-metadata-gate)
supersedes the pending static-head gate above: all12 jobs pass, including28
metadata unit cases, the first-attempt live head loop and the optimized image's
eight rendered heads/128 assertions. ID994 closes and section91 is Verified
before deployment; ID27 remains open and section1 Partial. The aggregate822/320,
89 N/A/231 applicable and58 Verified/40 Partial totals have different item states
from the earlier gap packet. Public-domain/social-provider rollout remains open;
the outsidebb4 export fix still requires its next exact-source runtime gate.
