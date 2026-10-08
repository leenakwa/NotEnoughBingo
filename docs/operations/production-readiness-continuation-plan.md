# Continuation checkpoint — 2026-10-08

## Goal and authoritative context

Complete every applicable production-readiness requirement that can be implemented
and verified before deployment. Leave only objective dependencies on the chosen
production infrastructure, actual providers/domain, operator/legal decisions,
deployment and target-only checks. Do not claim completion prematurely.

The active Codex goal contains this objective. The complete user continuation
request is preserved verbatim in
[production-readiness-continuation-request-2026-10-08.md](production-readiness-continuation-request-2026-10-08.md).
The original [prompt](production-readiness-prompt.txt) remains authoritative,
subject to later explicit user decisions, and must remain unchanged. Its expected
SHA-256 is `7b920f477e1087c2fe456f7bdbafef11e00e7be8ca17bc8ec99f180c274b65d9`.
Use the existing checklist, tracker, evidence log and execution plan throughout.

Preserve account dialogs, one-time language onboarding, profile language settings,
removed catalog/search language pickers, fixed header and intentional hover/shadow
changes. Preserve existing user edits. Do not merge or deploy without separate
authorization. Commits/pushes to the existing work branch are authorized.

## Latest resume checkpoint — 2026-10-08

This section supersedes historical checkpoints below. The native Codex goal is
**active**, without a token budget. Complete all applicable local requirements;
do not stop after one packet or passing CI. The original prompt and complete
continuation request are unchanged and verified by SHA-256. Continuation SHA-256:
`965004fb008a7a930c8f4fa34540cd4c113f1a74654fb0e8dd7438c18c2eefe7`.

### Source and exact-source gate

- Branch: `sk/production-readiness`; pushed HEAD:
  `b0d3e7e3f3dfb0e695c6f93e0b174c822fa1be26`.
- Draft PR: https://github.com/leenakwa/NotEnoughBingo/pull/18.
- [CI37715496152](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37715496152)
  **passes all nine jobs**: backend383, frontend503/40 files, browser smoke231
  plus12 intentional skips, full-stack119, foundation, secret scan, both
  production images and Release gate. Linux native-auth branch passed in smoke.
- Actual CI checkout `480beb3dc0c4706b64e1412bf995046d059cf4fd` is the PR merge
  commit. Its tree equals HEAD's `4ac79078c07e8f412f190c826d8c066d11a7d8ac`,
  verified through GitHub's commit API. Image labels use their actual build SHA;
  do not confuse merge identity with the head image identity.
- Earlier15632b6 CI37710181069 failed (seven jobs pass, full-stack115 pass/one
  fail, Release failed). It reused a revoked player session for token-email
  setup. The unaffected moderator identity is now checked before isolated
  verification. Limits and retries were not increased. Earlier a3e1c00 and
  d4dd0b7 failures remain in the evidence log.

### Completed b0d3e7e packet

- Login/register/forgot/reset request ownership prevents stale navigation,
  feedback, focus and callbacks after departure or replacement. A successful
  departed login still publishes global signed-in state. Reset initialization
  disables controls until the current UID/token scope is ready and preserves
  unrelated query/hash when cleaning the token. Auth35 unit cases pass.
- Guest sharing is a required/max50 nickname form with native Enter, actual
  FormData capture, synchronous duplicate/pending guard and request ownership.
  Player36 cases include old-success/error same-mounted board handover.
- Real auth departure16, native auth controls16, partial composition/reset12
  and guest failure/retry cases pass across four engines, retries zero. Mac
  WebKit uses temporary app-only keyboard navigation and documented Option-Tab
  for links; the originally absent preference was restored. Physical iOS and
  native password-manager behavior remain unverified.
- Final stable-source ordered live suite119/119 passes in5.8 minutes:
  /tmp/neb-auth-share-reset-full-ordered-oct08.log. Earlier selector, geometry,
  reset-empty-input and cleanup failures are retained; corrected reruns are
  separately logged. Independent correctness/security/coverage reviews pass.
- Append-only trusted-image asset publisher passes13 boundary tests, scoped
  reviews, Compose/Nginx/Ruff/YAML checks and actual image export. All50 original
  old/new assets pass hash/cache/security/gzip checks before promotion, after
  promotion and rollback; empty archive falls back to Next. No automatic pruning.

### Completed immutable b0d3e7e candidate

- Exact Git-archive configured frontend production build passes; actual Docker
  image ID `sha256:6802c9b1a4ecb1abb8316112f8812694b5654ada4074998cb31e2b564f7a4529`,
  tag `neb-rollout-frontend:new-b0d3e7e`, candidate port18584, no app mounts.
  Embedded/runtime release match; health200. Build log:
  /tmp/neb-frontend-b0d3e7e-production-build-oct08.log.
- Optimized auth/native-controls68/68 pass across four engines, retries zero:
  /tmp/neb-frontend-b0d3e7e-auth-browser-oct08.log. Mac app preference restored.
- Publication adds11 files, retained union61 files/2,159,808 bytes. All61 pass
  HTTP hash/cache/security/gzip checks before candidate promotion; the proxy's
  active frontend remains15632b6. First wrong config-digest export and undersized
  gzip-probe failures remain logged. Sanitized report:
  artifacts/frontend-candidate-b0d3e7e-2026-10-08.json.

### Current uncommitted upload-progress packet

- Transport and UI workers are complete and **source-frozen**. Shared contract:
  onProgress(UploadProgress{loaded:number,total:number|null}). New XHR transfer
  helper preserves API CSRF/credentials/errors/auth handling, signed storage
  fields/headers,120-second deadline, cancellation/terminal cleanup and stale
  callback guards. UploadStatus shows a bounded percentage only for known totals
  during transfer; preparation/processing/unknown totals are indeterminate.
- Worker scoped transport77 and UI97 cases pass. Integrated Node22 lint/types
  and **560 tests/42 files pass**:
  /tmp/neb-upload-progress-integrated-node22-oct08.log. Diff check passes.
- Independent scoped security, failure-semantics, UI correctness and browser
  coverage reviews find no material blocker. Browser coverage recommended visible
  Processing and enabled Cancel assertions after100; both are now added.
- First existing four-engine packet ends9 pass/two fail/one not run. Mobile
  inline cell editing hides the inspector after successful attachment; Escape
  now stabilizes the intended inspector flow. Desktop WebKit trace shows real
  intent429 from accumulated fixture traffic. No limit/retry increase. Separately
  seeded reviewed projects pass **12/12** (three each, four engines):
  /tmp/neb-upload-progress-existing-logout-*-reviewed-oct08.log.
- New valid1024×1024 random-RGB PNG exceeds3MiB without artificial padding. The
  real Chromium slow MinIO transfer/cancel/retry/ready-image/durable-draft case
  passes once in20.8 seconds, no storage fulfill or synthetic progress:
  /tmp/neb-upload-progress-large-initial-browser-oct08.log. Native-driven UI
  samples include intermediate percentages through100; held completionAPI proves
  processing remains separate from transfer. Original new assertions now await
  the full ordered gate; storage already accepted cannot be undone by cancellation.
- First full ordered120-case gate ends91 pass/one fail/28 not run, retries
  zero: last rendered transfer value99 rather than required100. Successful
  storage204 and phase transition can batch the final React progress render.
  The test now verifies bounded increasing intermediate progress and actual204,
  with visible indeterminate Processing/Cancel and no ready attachment while
  completion is held. It does not require rendering each terminal byte event.
  Failed log/trace retained: /tmp/neb-upload-progress-full-ordered-oct08.log.
- Root corrected **120/120 full ordered gate passes**,6.1 minutes, retries
  zero/no skips/no unexpected cases. Log:
  /tmp/neb-upload-progress-full-ordered-reviewed-oct08.log. Numeric report records
  3,147,780 bytes, native-driven intermediate UI percentages, storage204 and two
  actual CORS preflights. Ready1024×1024 asset persists after reload;320/1710
  layouts and page errors pass. Sanitized artifact:
  artifacts/upload-progress-rehearsal-2026-10-08.json. Scoped format/lint/types,
  diff/checklist and browser-source Gitleaks directory scan pass.
- Separate next-packet worker owns only profile-view.test.tsx; frozen19/19 unit
  cases (+4), lint/format pass. No app change. Exclude that file from the current
  upload commit; its new native browser evidence remains for next packet.
- Installed Chromium-only CDP transfer contract and primary docs were verified
  by upload_progress_contract; root actual runtime pacing is now observed.
  The test restores unlimited network conditions and detaches in finally.

### Root responsibilities and preserved environments

- Root owns shared QA browsers/fixture reset, PostgreSQL pytest, Docker flips,
  builds, CI, evidence and commits. Never run concurrent shared DB tests/reseeding
  or source writes during strict browser gates. Workers own disjoint code areas.
- Shared `nebqa` origin18080, Mailpit18025, existing QA volumes preserved.
- Isolated `nebrollout-a3`, private `/tmp/neb-rollout-a3`, currently frontend15632
  port18580, old web18581, new worker, PG/Redis/Mailpit18525. Asset proxies18582/3
  and b0 candidate18584 remain. Archive `/private/tmp/neb-frontend-assets-oct08`
  is append-only. Private credentials remain in mode600 temp files.
- Source images have no app mounts. Loopback HTTP, development Django settings
  and illustrative HTTPS origin are local evidence, not the target deployment.
- Mixed opposite-version core journeys pass3 each; new frontend/old backend
  sitemap503 preserves backend-first order. New/new sitemap passes after ready.
  Stale-tab/offline editor rehearsal is two tabs in one Chromium context, not
  independent contexts or every unprefetched lazy route. 135 RSC aborts and two
  deliberate offline failures are retained. Performance16 observations at390/
  1710 record152–165KB fresh JS/zero warm JS/CLS≤0.000775;284 aborted RSC reads
  make that diagnostic nonzero, with cause/server cost still unverified.

### Ordered next steps

1. Persist this checkpoint, exact b0 CI/image evidence and PR description.
2. **Complete locally:** stable-source120/120 ordered upload gate,12/12 scoped
   engine cases, genuine slow-storage proof, sanitized numeric artifact and
   independent reviews. Preserve failures and unchanged retries/limits.
3. Address independent review findings, run relevant gates, review final diff,
   commit/push this packet and obtain all-nine CI plus configured optimized-image
   evidence for that source. Update checklist only for requirements actually proved.
4. Next control observation at320/1710: .format-button, .size-control button,
   .tag-chips button, .card-action, .active-filters > button,
   .download-control > div button, .icon-button, profile-tabs roles,
   .language-options label, .switch-list label and .upload-button. Observe normal,
   hover, held press, keyboard focus and disabled/pending; hold real writes for
   async Like/download/upload/preferences. Synchronous loading is N/A. Section8
   still needs hover/active/loading/intended-form ownership mapping; section5
   needs duplicate and pending→error→retry→success geometry mapping per action.
   Section7's next gaps are profile native constraints/first-error order, account
   keyboard/normalization/dirty policy, editor required/title-language order,
   preference keyboard/dirty departure and social inventory reconciliation.
   profile_native_form_gaps confirms profile constraints already exist:
   required username3–30/ASCII-underscore/padded trim + backend lowercase,
   optional name80/bio500, hints, FormData and ordered error focus. No source bug
   established. Next worker owns profile-view.test.tsx only for three field
   rejections, multiple-error order, sibling retention and field-only clearing;
   root adds real native clamps/Tab/Enter/newline/heldPATCH/save-reload evidence.
   Native clipboard/autofill remain separate. Preserve deliberate hover/shadow
   and product decisions.
5. Continue other mapped local requirements. Merge, public deploy and registry
   promotion require separate authorization; commits/pushes are authorized.

Counters: **775 checked /367 unchecked**, **57 verified /41 partial /6 N/A /one
 deployment-only**. Section4 is closed after independent composition inventory
and real recovery cases. Section59 compatibility bullet is locally proved;
real CDN remains open. Native200% browser zoom/favicon chrome/autofill/password
managers/physical devices are capability gaps; viewport/DPR/page-only evidence
cannot close them. Goal remains active until all possible local work is done.

## Historical starting state

- Repository: `/Users/Daniil/Documents/VSCode/NotEnoughBingo`.
- Branch: `sk/production-readiness`.
- HEAD: `e4347a5` (missed explicit logout detection); not yet verified by CI.
- Last successful project CI: `1a671eb74afcde567c89d4240a12de1b8707b87e`,
  [run 37100203993](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37100203993).
- Existing dirty files: evidence log, tracker, root layout, live product flows;
  untracked development-feedback wrapper and `.codex/config.toml`.
- First pending task: complete disabled-Agentation lazy loading and strict
  WebKit/logout-event browser verification. Existing historical local tests are
  evidence for their tested source, not the current exact-source release gate.

## Ordered execution plan

1. **Complete:** restore context; read the entire original prompt; reconcile
   current source, 105 sections and 1,142 item statuses. Preserve this checkpoint.
2. **Complete locally:** finish Agentation asset isolation; independently review
   logout-event security; run strict related browser cases with retries disabled.
3. **Complete locally:** frontend/backend checks, configured production build/start,
   independent correctness/security/coverage reviews and concrete corrections.
4. **Complete for the previous packet:** commit/push reviewed source and obtain
   passing CI on exact SHA `c1fc2d7772ce697cb0dcccc528da4ab126040223`.
5. **Current:** work through prioritized remaining local requirements in bounded batches,
   using workers/explorers and relevant independent specialist reviewers. One
   writer per area; root coordinates shared database/browser/build runs.
6. Update checklist/tracker/evidence/plan only from observed evidence. Repeat
   implementation, verification and exact-source CI until no mandatory local
   requirement lacks evidence.
7. Reconcile final counts, release artifacts, operator dependencies and handoff.
   Complete the goal only when the actual Definition of Done is satisfied.

## Current checkpoint — 2026-10-08

Preservation commit `92c480a`; integrated session/feed/profile/account commit
`62386140d2a3bbee519e188441797ba0472d8176` is pushed. Its CI
[37697147428](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37697147428)
failed on frontend production npm audit (source-map-js 1.2.1); backend,
foundation and secret checks passed, dependent jobs skipped. Targeted lock update
to 1.2.2 is committed and pushed as `c1fc2d7772ce697cb0dcccc528da4ab126040223`.
[CI 37697846802](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37697846802)
passed all nine jobs, including the release gate. This gate covers that exact
source, not the next dirty packet. All nine jobs must pass for the final source.
Existing draft PR: https://github.com/leenakwa/NotEnoughBingo/pull/18.
No merge or deployment is authorized. User-local `.codex/config.toml` is preserved
and excluded from project commits; generated next-env build changes are restored.

- Frontend Node 22 lint/types: 352 tests / 38 files; format pass.
- Backend explicit test environment: 247 pass / one Nginx-image skip; Ruff,
  format, mypy 76 source files and migration drift checks pass.
- Strict four-engine live packet: 36 pass, retries zero; full page errors kept.
- Configured optimized build/start: two production route/layout probes pass.
  Temporary local production server was stopped after the probe.
- Full dated evidence and unsuccessful-run distinctions are in the evidence log;
  persisted pageshow is simulated and native autofill/BFCache remain unverified.

### Current dirty packet: implementation and local verification

- Profile updates are atomic; fault tests cover SQL rollback. Model-default tests
  cover explicit/inherited defaults, mutable factory independence, persisted
  values, timestamps and SQL defaults, including an old-writer INSERT omitting
  the new mail-delivery column. Publish/republish and export rollback tests pass.
- Password reset/change now lock a fresh user, commit credential/session/audit
  rows together, and rotate the replacement session before commit. Password
  security-email intent is durable and recoverable with bounded retry scanning.
  Independent scoped security review passes. Verification, email-change and
  deletion notifications now also have durable intent, bounded recovery and
  reconstructible HMAC tokens. Migration accounts.0006 is applied on local QA;
  worker/Beat were restarted and task registration checked. Real provider
  delivery remains unverified; SMTP acknowledgement can precede DB acknowledgement.
- Profile language, privacy and notification controls have pending feedback,
  rollback, dirty-input and keyboard regression coverage. Session sign-out and
  deletion cancellation have scoped progress and duplicate guards; their new
  four-engine browser cases pass in the final 24-case packet.
- Sitemap uses an index and sparse integer PK buckets; the 10,002-board API
  regression passes. Anonymous XML, escaping, capacity and immediate visibility
  tests pass. Backend must deploy before the new frontend. A temporary scaled
  PostgreSQL database verified 10,001 public boards across two parts, one SELECT
  per API response and EXPLAIN plans; it was removed without changing source data.
  An optimized-production XML traversal passed locally (two parts, ten URLs).
  The reusable verification script passes independent malformed-input review
  and actual optimized-server traversal; its three initial false-pass checks
  were corrected before use.
- SSR IP forwarding is implemented behind the explicit server-only
  `SSR_TRUST_PROXY_CLIENT_IP=true` flag and private normalized Nginx contract.
  Direct Next defaults off. Independent security review and four PostgreSQL
  identity/throttle tests pass; QA frontend was recreated with the explicit flag.
  Production network/header enforcement still needs target evidence.
- Lock-only brace-expansion patches are installed; production npm audit has zero
  findings. The remaining development braces advisory is traced to trusted
  ESLint root-directory globs, without an application-input path in that scope;
  the advisory remains present and is not dismissed as fixed.

Export endpoints retain HTTP 202 and their owned job after an operational broker
failure. A bounded recovery scanner and serialized per-user creation prevent
stranded and duplicate account jobs; PostgreSQL fault/concurrency tests and review
pass. Draft/revision GET lists now paginate (24 default, 100 maximum); OpenAPI and
TypeScript contracts include required idempotency headers. Database access,
ordering and limits plus independent review pass. Existing external array
consumers must migrate; no repository frontend consumer was found.

Latest integrated checks: backend **363 pass / one infrastructure skip**;
frontend Node 22 **415 tests / 40 files**, lint/types/format pass. Ruff/format,
mypy (77 source files), migration drift and exact generated OpenAPI comparison
pass. These checks include the final legacy-hash preservation correction and
do not constitute an exact-source CI gate. A real process-local closed broker
probe preserved registration 202/pending intent; normal-broker republish reached
the worker and Mailpit. Its incorrect pending-account cleanup guard failed, then
a separately logged corrected guard removed the synthetic account.

New four-engine preference browser packet: 15/16 pass, retries zero. Chromium
all-language retry received a real gateway 502 at 22:52:44 UTC, immediately after
backend source changed at 22:52:43 UTC. Other upstream requests also received
502. Source-autoreload interference is strongly correlated but not proven by a
process log. Failure trace and logs are preserved. The stable-source rerun passed
**16/16**, four engines, retries zero; the chooser assertion waits for loading.
Native password-manager autofill and native BFCache are still unverified.

No-setter fresh-lock step-up checks and their nine real PostgreSQL cases pass;
final scoped security review passes. Final **24/24** preference/sign-out/
cancellation cases pass in four engines, retries zero. Configured optimized
build/start and sitemap traversal pass; temporary server stopped.

This packet is committed/pushed as `d4dd0b7a16bfbb5f02d7d9a266a9c686a74f5fd2`.
[CI 37703857269](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37703857269)
failed the production Next.js audit after six new advisories appeared. Backend,
foundation and secret scan passed; dependent jobs skipped. Official maintainer
release/registry verification supports the bounded Next.js and eslint-config-next
16.3.8 patch; both host and Node 22 container clean installs pass and production
npm audit reports zero findings. No custom cache adapter requires migration.
The corrected source is included in `a3e1c00`; its current exact-SHA gate is
recorded below.

The next packet, now committed as `a3e1c00`, adds explicit token-only transient Retry with
pending/duplicate controls and current-request ownership, plus image-description
validation association/focus and visible editor field limits. Independent scoped
reviews pass, including correction of a stale resend completion race. Node 22
lint/types and **454 frontend tests / 40 files** pass; format passes. Sources are
frozen for live checks. Root owns the live-flow file, shared runners and docs.

Initial new browser packet: **3 passed / 4 failed / one interrupted / eight not
run**, retries zero. Diagnoses: wrong email-change success assertion (actual 204),
a border select locator/key assumption, default verification quota shared across
projects, and mobile inline editing hiding the inspector despite successful
upload. Keep the failed traces. Correct the test interactions/contracts and run
projects separately with normal fixture reset; never bypass or raise quotas.
Final scoped cases pass **16/16** across Chromium, mobile WebKit, Firefox and
 desktop WebKit, retries zero. A first Firefox reused-link request received an
actual Nginx HTML 429; a separately paced four-case run passed. Its auth zone is
10 requests/minute with the existing QA/CI burst 30; no setting was increased.
The tests close the visible mobile inspector before Finish. For full-suite quota
isolation, email-change setup verification uses a player fixture actor and the
registration consumed-token check uses an author actor; the first registration
retry stays anonymous. Its final eight token cases pass across the same four engines, retries zero.
Native OS file selection is not covered.

New request-size assertions were independently reviewed. Their initial run had
five wrong list-valued error-envelope assertions; after correction all **seven
cases pass**. They prove bounded no-Content-Length parser reads, oversized actual
PUT rejection without mutation/storage/enqueue, and normalized UTF-8 exact/over
boundaries with unchanged draft/version/ETag. The byte-boundary case explicitly
lowers its cap because valid bounded fields cannot reach 512 KiB. Real oversized
malformed envelopes are tested separately. Full PostgreSQL integration passes **370 tests / one infrastructure skip**;
Next.js 16.3.8 optimized build passes. A new actual 320 px long-tag overflow
was reproduced after successful editor save/reload, and bounded chip wrapping
passes the focused Chromium regression. The configured production build/start
and sitemap walker pass (two parts / ten URLs / 1,808 bytes). Explore repeated-query metadata is corrected and independently reviewed;
15 new metadata regressions bring the final frontend total to **469 / 40 files**
with lint/types/format pass. The final configured production build, ten-route
heading/canonical/alias/duplicate probes and sitemap walk pass. Section 36's three
local policy bullets are checked; target hostname/HTTPS remain open. Final
quota-isolated token amendment passes eight cases in four engines, retries zero.

The section 42 mapper found a concrete defect: both follow POST routes commit
Follow before notification/event writes without a containing transaction.
A late fault left the relationship; retry skipped missing records.
`request_limit_regressions` implemented those handlers plus the new follow
transaction tests. Corrected verified-fixture
baseline reproduced four SQL rollback failures; two access cases passed. Root
sent GO after runners finished; the three-line atomic fix passes all six cases
and independent review. The first browser packet had shared-fixture liked-state
ordering failures (nine passed / three failed); separate-project reset runs
pass **12/12** across four engines, retries zero. Six moderation/share late SQL
rollback cases pass and independent coverage review passes. Full mypy (77 files),
Ruff/format, migration drift and exact OpenAPI comparison pass. Final integrated backend passes **382 tests / one infrastructure skip**. Relevant
local transaction mapping is complete and the §42 transactions bullet is checked.
Final frontend total is **469 / 40 files**, lint/types/format pass. This packet is committed/pushed as
`a3e1c00e945855df82be25191207610ef861e148`; user-local `.codex/config.toml`
remains untracked and generated Next env changes are restored. Exact-source
[CI 37707547894](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37707547894)
failed its smoke/full-stack expectations and Release gate; see the latest
checkpoint above for their corrections. Require all nine jobs for next source. PR #18's
body is updated with the current packet and the previous audit failure. First
pending task for that snapshot was CI/native/rollout mapping. The newer resume
checkpoint above supersedes this queue. Continue remaining local work after
reviewed fixes; do not stop at CI.
One commit or passing CI does not complete the goal.

## Delegation record

- `agentation_fix` worker: lazy wrapper, server/client/header session baseline,
  persisted-page lookup and initial account-change corrections; complete.
- `feed_lifecycle` worker: pagehide cancellation/pageshow re-fetch; complete.
- `profile_forms` worker: actual form snapshots, 500-character bio, pending
  credential guards and post-render focus; complete.
- `logout_security` security reviewer: signed marker/CSRF/private cache and
  shared baseline review; no remaining security finding in that scoped patch.
- `session_review` reviewer: found/corrected initial identity and pageshow gaps;
  final code review passes. Read-only DB/API remainder inventory complete.
- `session_coverage` test analyst: final scoped coverage review passes.
- Completed next-packet writers: `agentation_fix` profile/default/fault tests;
  `profile_forms` language/privacy/notification controls; `sitemap_scale` scalable
  backend/XML sitemap and SSR IP forwarding; `credential_transactions` credential
  transactions and durable password security-email intent.
- `session_review` independently reviewed profile/default, sitemap, export,
  list-contract and sitemap-verifier changes; those scopes pass.
  `credential_security` completed credential/SSR/mail reviews and identified the
  now-fixed stale-password race. `credential_transactions` owns the final
  no-setter step-up correction (complete). Completed queue-failure findings are fixed.
- `remaining_form_evidence` explorer completed a bounded auth/editor inventory;
  verification retry and image-description focus are the next defects. It ran
  no shared browser/database tests and made no edits.
- `verification_retry` worker owns only the token verification component and
  its tests. `editor_validation` owns editor/details/inspector and adjacent tests.
  Root owns `live-product-flows.spec.ts`; writers must not edit that shared file.
  Avoid simultaneous pytest database recreation.
- Current completed scopes: `verification_retry` and `editor_validation` writers;
  independent callback/focus reviews; `request_limit_regressions` writer and
  `api_contract_evidence_review` analyst. `session_review` also reviewed root's
  new token/editor E2E cases and tag-wrap CSS, with no actionable finding.
- `mobile_upload_trace` found test inline-editing visibility and actual long-tag
  overflow from traces/source; root corrected both and is running strict cases.
- `public_metadata_gaps` completed read-only section 36 mapping and found the
  repeated-query metadata defect. `explore_metadata_fix` owns only Explore route
  metadata and the existing public-metadata tests; GO was sent after runners
  finished. Root owns final integrated checks/build/browser/commit/CI.
- Root owns commits, docs, shared QA/browser/database runs, builds and CI.

## Resume instructions

Read this file and the most recent evidence entries, inspect `git status`, branch,
HEAD and CI before acting. Reuse completed investigations. Finish the current
first pending task, then continue the remaining queue; do not restart the audit.
Keep this checkpoint updated with exact SHA, commands/results, unresolved defects
and the next concrete task whenever work is handed off or context is compacted.

## Remaining local batches (inventory, not completion claims)

Current counters are 56 verified / 42 partial / 6 N/A / 1 deployment-only;
772 checked and 370 unchecked items. Section 82 has eleven mapped local
contract bullets; provider timeout remains open. Unchecked items include external and N/A
conditions; these counts are not a product-readiness percentage.

1. Sections 4/5/7/8: per-form/control evidence matrix, starting with profile
   details/languages and account settings, then editor details/inspector and
   remaining auth/social controls. Reuse prior lifecycle/autofill/validation
   evidence; verify missing Enter/Tab/form ownership, labels/limits, focus,
   dirty-work protection, layouts and practical upload progress.
2. Sections 42/76/82: database defaults/multiwrite transactions, important API
   endpoint evidence matrix, actual network/request-size/query measurements.
3. Sections 21/24/92: native zoom, discretionary ARIA/UI contrast, favicon
   visibility; record genuinely unavailable physical device capabilities.
4. Sections 34/36: sitemap pagination beyond the current 10,000-board cap,
   semantic headings/canonical/duplicate-URL policy and remaining joined/query
   load measurements.
5. Sections 59/72/103/104/105: mixed frontend/backend rehearsal, compatible
   migration ordering, immutable artifact/config retention, concrete rollback
   preparation and exact final-source CI.
6. Map existing local mail/logging/cookie/privacy/metrics/health evidence to
   individual unchecked bullets before inventing more features or tests.

Reproducible QA stack survives restart as `nebqa` at `http://localhost:18080`,
Mailpit `http://localhost:18025`; root owns shared browser/database tests.
Explicit backend unit environment: `DJANGO_SETTINGS_MODULE=config.settings.test`
and `USE_S3=false`. Container development settings override pytest's default;
do not accidentally run the test suite against development S3.

The initial-header baseline finding is fixed and covered by deterministic unit
regressions. Request-order-dependent browser bootstrap variants were removed;
use the final 36-case packet and do not claim the removed harness as final proof.
Keep failed browser/network/configuration runs visible in the evidence log.
