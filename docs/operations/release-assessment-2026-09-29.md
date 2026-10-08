# Local release assessment — 2026-09-29

The [complete production-readiness prompt](production-readiness-prompt.txt)
and its [105-section tracker](production-readiness-tracker.md) are the scope for
final sign-off. This report records local evidence only; it does not claim that
every checklist item has been verified on a public deployment.

Latest observation —2026-10-08: Exact5ed50c0 passes all12 jobs in
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

Current checklist:816 checked/326 unchecked;58 verified/40 partial/six N/A/
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
