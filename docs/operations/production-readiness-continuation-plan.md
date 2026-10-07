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
4. **Current:** record local evidence, commit/push the reviewed source to the existing branch,
   wait for CI on that exact SHA, investigate failures and obtain a passing gate.
5. Work through prioritized remaining local requirements in bounded batches,
   using workers/explorers and relevant independent specialist reviewers. One
   writer per area; root coordinates shared database/browser/build runs.
6. Update checklist/tracker/evidence/plan only from observed evidence. Repeat
   implementation, verification and exact-source CI until no mandatory local
   requirement lacks evidence.
7. Reconcile final counts, release artifacts, operator dependencies and handoff.
   Complete the goal only when the actual Definition of Done is satisfied.

## Current checkpoint — 2026-10-08

Preservation commit `92c480a`; integrated session/feed/profile/account changes
are reviewed and locally verified, awaiting commit/push/exact-source CI. All
9 original PR gate jobs must pass for the new commit before using it as a gate.
Existing draft PR: https://github.com/leenakwa/NotEnoughBingo/pull/18.
No merge or deployment is authorized. User-local `.codex/config.toml` is preserved
and excluded from project commits; generated next-env build changes are restored.

- Frontend Node 22 lint/types: 352 tests / 38 files; format pass.
- Backend explicit test environment: 247 pass / one Nginx-image skip; Ruff,
  format, mypy 76 source files and migration drift checks pass.
- Strict four-engine live packet: 36 pass, retries zero; full page errors kept.
- Configured optimized build/start: two production route/layout probes pass.
  Temporary local production server must be stopped after the probe.
- Full dated evidence and unsuccessful-run distinctions are in the evidence log;
  persisted pageshow is simulated and native autofill/BFCache remain unverified.

Next concrete implementation packet: profile update transaction rollback and
model-default contracts (§42); remaining API/network inventory (§76/82) should
reuse current test evidence before adding tests. The independent reviewer found
User.username saved before UserProfile without atomicity, and no comprehensive
model-default contracts. Password reset/change failure/concurrent-token handling
warrants a separate bounded investigation; do not wrap cache/session/broker work
blindly in an SQL transaction. Sitemap >10,000 and remaining forms follow.

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
- Root owns commits, docs, shared QA/browser/database runs, builds and CI.

## Resume instructions

Read this file and the most recent evidence entries, inspect `git status`, branch,
HEAD and CI before acting. Reuse completed investigations. Finish the current
first pending task, then continue the remaining queue; do not restart the audit.
Keep this checkpoint updated with exact SHA, commands/results, unresolved defects
and the next concrete task whenever work is handed off or context is compacted.

## Remaining local batches (inventory, not completion claims)

Current counters are 56 verified / 42 partial / 6 N/A / 1 deployment-only;
752 checked and 390 unchecked items. Unchecked items include external and N/A
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
