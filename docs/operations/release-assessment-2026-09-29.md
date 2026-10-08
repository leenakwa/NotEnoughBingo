# Local release assessment — 2026-09-29

The [complete production-readiness prompt](production-readiness-prompt.txt)
and its [105-section tracker](production-readiness-tracker.md) are the scope for
final sign-off. This report records local evidence only; it does not claim that
every checklist item has been verified on a public deployment.

Latest observation —2026-10-08: source `c6d770d` has seven passing CI jobs,
including388 backend tests on Python3.13/PostgreSQL,587 frontend cases and372
smoke/12 intentional skips. Full-stack has96 passes, two failures and25 not run;
Release fails in [CI37750054487](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37750054487).
Both traces show the player resetting to “Opening bingo…”; a local StrictMode
regression reproduces it, and its correction still needs a complete source gate.

Latest complete passing source `0655989` passes all nine jobs in
[CI37743142188](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37743142188):
backend383, frontend587/43 files, smoke372/12 intentional skips and full-stack123,
with no flaky cases; both production images and Release pass. The tested merge
and branch head have the same complete tree. Historical failures remain in the
dated evidence.

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
the complete source gate fails as recorded above. Existing configured frontend observations remain scoped to065.

Current checklist:804 checked/338 unchecked;59 verified/39 partial/six N/A/
one deployment-only. Counts describe evidence, not a product-readiness percentage.
The [tracker](production-readiness-tracker.md) and
[dated evidence](production-readiness-evidence.md) contain scope and open items.

## Decision

Source065 has a complete CI gate; current source requires a new passing gate.
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
