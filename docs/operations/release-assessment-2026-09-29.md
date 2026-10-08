# Local release assessment — 2026-09-29

The [complete production-readiness prompt](production-readiness-prompt.txt)
and its [105-section tracker](production-readiness-tracker.md) are the scope for
final sign-off. This report records local evidence only; it does not claim that
every checklist item has been verified on a public deployment.

Current continuation evidence (2026-10-08): pushed `b0d3e7e` passes all nine
jobs in [CI37715496152](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37715496152):
backend383, frontend503, smoke231/12 intentional skips, full-stack119, both
production images, scans and Release gate. The actual PR merge checkout has the
same tree as HEAD. Earlier failed revisions remain in the dated evidence.

Its exact Git-archive configured optimized frontend image passes68 auth/control
cases across four engines, retries zero; matching build/runtime release and
health200. The asset archive now holds61 files, all checked over HTTP before
candidate promotion. Original50-file promotion/rollback checks and compatible
backend/worker rollout have separate sanitized evidence. Local images use
loopback HTTP, development Django settings and an illustrative HTTPS origin.
Sixteen optimized fresh/warm observations record152–165KB fresh JS and tiny CLS;
284 aborted RSC reads mean that diagnostic is not a clean performance gate.

The separate uncommitted upload-progress packet passes Node22 lint/types and560
tests and120 ordered live cases, with scoped reviews. Actual3MiB slow-storage
progress/cancel/retry/processing/ready-attachment/reload proof passes;12 scoped
cases across four engines also pass. New CI/immutable-image gates remain pending.
Real CDN, target capacity, native browser zoom/favicon/autofill/device
evidence and other local requirements remain open. The checklist records775
checked/367 unchecked;57 verified/41 partial/six N/A/one deployment-only.

Use the [continuation checkpoint](production-readiness-continuation-plan.md) and
latest [dated evidence](production-readiness-evidence.md). All observations below
remain historical; the current working tree is not a completed release gate.

## Decision

The committed source above passes its exact-source CI and bounded local image
gates. Every subsequent revision must pass again before promotion; the separate
working-tree packet is not a completed release gate. This is **not an authorized
public
deployment**. Images have not been promoted to a production registry or tested
on the target platform.
Production operator identity, private support contact, legal review, managed
services, TLS/ingress, secrets, monitoring, and off-site recovery remain to be
configured and verified for the target environment. See the
[production deployment baseline](production-deployment.md).

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

## Verified locally

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

## User-path notes

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

1. Review and merge the draft release PR when approved. GitHub Actions run
   `36630667887` passed the `Release gate` on
   `d629a7153c5b33ddf6ece438bdc98faf2d428067`, including clean-install
   full-stack flows, image scanning, and SBOM generation; a later run also
   passed on `056576509d87d41073d1af9796bc1a2098abe703`. Require the same
   gate on the final PR head. Production registry
   publication, signing/attestation, digest promotion, and platform rollback
   still need a target deployment.
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
