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

First pending task: finish final diff/document checks, commit/push this packet
and require all nine CI jobs on its exact SHA. During CI, continue the remaining
local queue. Read-only form inventory found two next concrete defects: token-only
verification failures have no Retry control, and image-only publication does not
focus/associate the invalid image description. Implement those in separate
bounded areas after committing this stable packet. One commit or passing CI
does not complete the goal.

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
- `session_review` independently reviewed profile/default, sitemap, export and
  list-contract changes; it is reviewing only the new sitemap verification tool.
  `credential_security` completed credential/SSR/mail reviews and identified the
  now-fixed stale-password race. `credential_transactions` owns the final
  no-setter step-up correction (complete). Completed queue-failure findings are fixed.
- `remaining_form_evidence` explorer completed a bounded auth/editor inventory;
  verification retry and image-description focus are the next defects. It ran
  no shared browser/database tests and made no edits.
  Avoid simultaneous pytest database recreation.
- Root owns commits, docs, shared QA/browser/database runs, builds and CI.

## Resume instructions

Read this file and the most recent evidence entries, inspect `git status`, branch,
HEAD and CI before acting. Reuse completed investigations. Finish the current
first pending task, then continue the remaining queue; do not restart the audit.
Keep this checkpoint updated with exact SHA, commands/results, unresolved defects
and the next concrete task whenever work is handed off or context is compacted.

## Remaining local batches (inventory, not completion claims)

Current counters are 56 verified / 42 partial / 6 N/A / 1 deployment-only;
753 checked and 389 unchecked items. Unchecked items include external and N/A
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
