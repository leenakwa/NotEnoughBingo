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

Goal remains active. This checkpoint supersedes historical checkpoints below.
Prompt and continuation request remain unchanged; expected continuation SHA-256:
`965004fb008a7a930c8f4fa34540cd4c113f1a74654fb0e8dd7438c18c2eefe7`.
Current pushed HEAD: `15632b6d0b17a8b90d7634fe404a54dbcdcc4cc4` on
`sk/production-readiness`; draft PR: https://github.com/leenakwa/NotEnoughBingo/pull/18.
[CI 37710181069](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37710181069)
failed: seven jobs passed; full-stack 115 pass / one fail, Release failed.
The email-change fixture copied a player session already revoked by the preceding
password test; anonymous verification hit the unchanged five/hour limit. The
uncommitted correction proves the unaffected moderator's real identity before
creating/verifying the isolated account. Last all-nine green remains `c1fc2d7`.
CI builds a PR merge SHA; its tree was verified equal to the pushed source tree.
Do not confuse that merge identity with the head's image identity.

Uncommitted implementation packet:

- Auth request ownership prevents departed/replaced login, register, forgot and
  reset forms from applying stale navigation, focus, feedback or callbacks.
  A successful departed login still publishes the global signed-in fact.
  Reset query cleanup preserves unrelated parameters/hash. Scoped tests pass34.
- Guest sharing is a native form with required/max50 nickname, Enter submit,
  synchronous duplicate guard, scoped errors, pending controls and lifetime
  protection. Submission captures actual FormData, including DOM/autofill values.
  Scoped tests pass34; actual held-failure/retry/Enter case passes four engines.
- Integrated Node22 lint/types and 501 frontend tests/40 files pass (final reset gate). Backend app
  source unchanged since 382 PostgreSQL passes / one infrastructure skip.
- Auth departure cases pass16 across four engines, retries zero. Earlier geometry
  expectation failures and one WebKit missing-input run remain retained; hydration
  preconditions/filled-value assertions were added, without increasing retries.
- New auth-native-controls first run6 pass/10 fail: Username exact accessible
  name included its help, and macOS WebKit default Tab skipped buttons. Corrected
  label selector; temporary app-specific AppleKeyboardUIMode2 then14 pass/two fail
  (login recovery link Tab in WebKit). Preference restored to originally absent.
  Native link-key verification is pending; no synthetic focus/tabindex workaround.
- Reset initialization gate now disables controls until current UID/token scope
  is ready, including query changes. Meaningful pre-passive-effect regression and
  independent review pass; scoped35 tests, full501 checks pass. Real Chromium
  reset/reuse journey passes once. Full ordered gate still pending.
- Two composition cases integrated. Initial trial found two relative-has locator
  defects and a held-route/unroute cleanup race; ended two failures/one Chromium
  reset pass, interrupted remaining cases (exit130). Corrected tests load Created
  normally then hold Drafts, await held-handler completion before unroute, and use
  relative card heading selectors. Four-engine twelve-case reviewed run passes12/12, retries zero:
  /tmp/neb-auth-reset-partial-composition-reviewed-browser-oct08.log.
- Final native constraints/Tab/Enter/pending/error run passes16/16 across four
  engines at320/1710. Mac WebKit uses documented Option-Tab for links and a
  temporary app-only keyboard-navigation preference for buttons; restored absent.
  Physical iOS and Linux branch remain separate from this host observation.
- Full ordered119-case run passes119/119 in5.8 minutes, retries zero:
  /tmp/neb-auth-share-reset-full-ordered-oct08.log. Fixture ownership correction,
  real reset/reuse and guest/partial scenarios pass in their actual full order.
- Independent test review found only a same-mounted share-transition coverage
  gap; two success/error regressions now pass, player group36. App source unchanged.
  Independent retention correctness/CI review found no meaningful issue; root
 13 boundary tests/Compose/Nginx/Ruff/YAML pass; browser-source Gitleaks dir clear.
- First ordered117-case run failed a guest feedback selector matching Next's
  route announcer:94 pass / one fail /22 not run. Main-scoped selector fixed;
  targeted guest case passes4. Second ordered run ended113 pass / one fail /three
  not run: reset-token reuse produced no POST and the final input was empty.
  Trace is retained under frontend/.playwright-cli/artifacts/
  auth-share-full-ordered-reviewed-oct08; read-only diagnosis is assigned to
  api_contract_evidence_review. Do not call the full suite passed.

Release evidence completed locally:

- Immutable old/new frontend × opposite backend core journeys each pass three
  Chromium cases. New frontend/old backend sitemap returns503/no-store with
  Retry-After300, preserving the backend-first rollout requirement. New/new
  sitemap passes two parts/ten URLs after readiness.
- Same-origin stale-tab rehearsal passes one strict Chromium case: two tabs in
  one browser context, offline unsaved Unicode recovery, old→new frontend,
  real RSC/document fallback, durable editor version1→2, and old web/frontend
  rollback while retaining forward schema/new worker. Zero page errors/HTTP
  failures;135 RSC aborts and two deliberate offline failures are retained.
  This does not prove every lazy route or independent browser context.
- New append-only asset publisher has13 boundary tests and scoped security
  review. Nginx serves all50 files in the old/new union with matching hashes,
  cache/security headers and gzip before promotion, afterward and after rollback.
  Empty archive falls back to Next; missing/private/map/traversal paths cannot
  gain immutable error caching. Idempotent republication adds zero files.
- Sixteen immutable-image fresh/warm observations cover four routes at390/1710px.
  Fresh JS transfer152–165KB, warm JS zero, CLS≤0.000775. Probe exits1 because
  284 RSC requests were aborted; no API/document failure/page error occurred.
  Cause/server cost and real CDN/capacity remain unverified.
- Sanitized reports: artifacts/mixed-frontend-rehearsal-2026-10-08.json,
  artifacts/frontend-assets-rehearsal-2026-10-08.json,
  artifacts/frontend-performance-2026-10-08.json. Existing backend rehearsal is
  artifacts/mixed-backend-rehearsal-2026-10-08.json. Never commit raw auth traces.

Isolated project `nebrollout-a3`, private workdir `/tmp/neb-rollout-a3`, currently
new-frontend18580 + old-web18581 + new-worker, PG/Redis/Mailpit18525. Asset proxies
18582/18583 and archive `/private/tmp/neb-frontend-assets-oct08` remain for checks.
Source images have no app mounts; loopback HTTP/development Django settings and
illustrative HTTPS origin are not target deployment evidence. Root owns Docker
flips, shared QA browsers, DB tests and commits. `nebqa`18080 is separate.
Credentials stay in mode600 temp files. No concurrent shared PostgreSQL pytest,
fixture reseeding or application writes during strict browser runs.

Next ordered work:

1. **Complete:** prompt/request hashes verified; checkpoint, retained-assets
   deployment instructions, tracker/evidence/assessment/artifacts reconciled.
2. **Complete locally:** reset initialization correction and independent review,
   native auth16 and partial/reset12 strict cases. Share board-handover two new
   regressions close the independent coverage recommendation; no app change.
3. **Complete locally:** stable-source ordered119/119 browser run, final scoped
   lint/format, Node22 player36 (two added regressions), independent reviews,
   artifact/browser-source Gitleaks directory scans and infrastructure checks.
4. Commit/push reviewed packet; obtain all nine green CI jobs for its exact source
   and verify its configured optimized artifact. Update durable evidence after
   actual results. Never merge/deploy/registry-promote without authorization.
5. Next mapped local batch: implement real upload byte progress and observe a
   valid multi-MB slow MinIO transfer, processing/persistence, cancellation/retry.
   Explorer found fetch phase labels only; historical claim that presigned POST
   cannot report byte progress is unsupported. Official XHR docs confirm upload
   progress, unknown-total indeterminate state and cross-origin preflight. Keep
   API-local CSRF/credentials/auth/error semantics, storage signed fields/headers
   without API cookies,120-second deadline, cleanup and lifetime guards. Read-only
   upload_progress_contract report gives primary MDN/WHATWG refs; no source edits
   for this next batch yet. Root owns actual upload browser evidence.
6. Observe custom format/size/card/tag/download hover/pressed/focus/pending states
   at320/1710 before minimal scoped CSS; preserve deliberate hover/shadow design.
   Continue other local mapped requirements. Do not end after one green gate.

Counters: **774 checked /368 unchecked**; section verdicts after section4 closure:
57 verified /41 partial /6 N/A /one deployment-only. Section59 compatibility
bullet closed from mixed-image/stale-tab/retained-assets evidence; real CDN still
open. Section4 partial-composition bullet is closed after both cases passed in all
four engines and inventory reconciliation.
Native200% browser zoom/favicon chrome/autofill/password managers/physical devices
remain capability gaps; viewport/DPR/page-only evidence cannot close them.
Only actual deployment/operator dependencies may be left at the end; goal active.

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
