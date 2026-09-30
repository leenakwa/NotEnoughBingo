# Production readiness evidence log

Use this log with the [full prompt](production-readiness-prompt.txt),
[execution plan](production-readiness-plan.md), and
[105-section tracker](production-readiness-tracker.md). Each entry records
observed results and their limits. Do not include credentials or session data.

## Baseline — 2026-09-29

- Repository: `master`, remote `origin`; working tree already contains extensive
  uncommitted user work. No reset, commit, or deployment was performed.
- Isolated `nebqa` Compose stack: PostgreSQL, Redis, MinIO, Mailpit, Nginx,
  backend, frontend, worker, and Beat were healthy at inspection.
- Prior local tests, browser flows, builds, scans, and their limitations are
  recorded in the [local release assessment](release-assessment-2026-09-29.md).
- The user brief was copied exactly: 40,643 bytes, SHA-256
  `7b920f477e1087c2fe456f7bdbafef11e00e7be8ca17bc8ec99f180c274b65d9`;
  its 105 numbered sections and definition of done were verified.

## New observations

### 2026-09-29 — Account recovery and rate limits (sections 6, 11–13, 32, 45, 53)

- In the isolated `nebqa` stack, a failed network request on Forgot Password
  previously showed the same success message as an accepted request. The form
  now shows a retryable connection error and preserves the entered email.
- Password-reset email requests and link confirmations shared a 3/hour DRF
  throttle. They now have separate 3/hour and 20/hour scopes. A server test
  proved a throttled second email request does not block a valid confirmation.
- The API client now explains a non-JSON Nginx 429 response. The full live
  browser suite exercised email delivery through Mailpit, password change,
  invalidation of the old session, rejection of token reuse, and login with
  the new password. The suite passed 12/12 before the later route changes.

### 2026-09-29 — Missing public resources (sections 30, 36, 77, 99–100)

- Next.js dynamic detail pages previously rendered a visual error with HTTP
  200. The SSR lookup now distinguishes a real API 404 from a transient API
  failure. Removing the root streaming loading boundary allowed `notFound()`
  to return HTTP 404. Discover, Explore, and Trending retain route loading
  states. Two targeted live Chromium scenarios passed: private bingo access
  and missing bingo/share/profile/unknown URLs all returned 404 with a way
  back to Discover. Frontend typecheck, lint, 64 unit tests, format, and
  production build passed after this change.

### 2026-09-29 — Account switching and editor recovery (sections 13, 32, 43, 58, 101–102)

- Editor recovery was stored in a browser key shared by every account. It is
  now scoped to the authenticated user's public ID; explicit logout, current
  session revocation, and account-deletion scheduling clear recovery. A unit
  test proves another account cannot read the saved recovery through the app.
- Authentication changes propagate across tabs through a storage event and
  focus revalidation. A live two-tab test confirmed that logging out in one
  tab removes the other tab's private profile view, clears legacy recovery,
  and updates the account UI after a second user logs in.
- An offline editor test exposed a brief gap between a successful new-draft
  save and the URL update. The editor now replaces the URL synchronously when
  the server returns the bingo ID. The repeat live test passed: offline edit,
  failed save, local recovery, retry, refresh, and persisted cell content.
  Frontend typecheck, lint, and 65 unit tests passed before the URL fix;
  typecheck, lint, and 65 unit tests passed again after it.

### 2026-09-29 — Media upload errors (sections 6, 19, 25, 52)

- A live browser upload of PNG bytes named `.jpg` exposed the internal
  `extension_mime_mismatch` code to the user. Media validation now keeps codes
  internally and returns specific, actionable messages from the upload API and
  rejected-asset detail response. An unknown code gets a safe generic message.
- The live Chromium case passed after the fix: unsupported SVG is rejected in
  the browser, a mismatched image gets HTTP 400 with a useful explanation, and
  neither is attached to the cell. A valid `.png` declaration containing
  corrupt bytes reached asynchronous processing, was rejected with a useful
  explanation, and was not attached. An oversized cell image was stopped in
  the browser; a separate oversized API declaration returned HTTP 400 with a
  useful message. Focused backend validation/API checks passed 4/4, with the
  additional oversize assertion passing separately. A live browser test then
  forced the object-storage POST to return 503. The editor explained how to
  retry, attached no asset, and successfully attached the same image after the
  simulated outage was removed. These local tests do not validate an outage
  of a real production storage provider.

### 2026-09-29 — Session expiration with unsaved work (section 102)

- When a signed-in session disappears while the editor is open, the header now
  navigates to login with an explanation and a safe `next` path. The editor's
  local recovery remains scoped to the same account. A live Chromium test
  passed: edit a saved draft offline, lose the session, log back in, restore
  the unsaved text, and save it. The two-tab logout scenario passed again with
  the updated login state. Frontend typecheck and lint passed.

### 2026-09-29 — Frontend image origin (sections 36, 40, 70, 91, 103)

- The production Dockerfile previously defaulted to a localhost public URL.
  It now requires an explicit HTTPS origin and carries it into the runtime
  stage. CI supplies a clearly non-deployable `.invalid` origin for its build
  check; the real image must be built with the actual public domain.
- A production frontend image built successfully with the CI origin, ran as a
  separate container on the QA network, returned HTTP 200 for health and
  `/create`, and generated `robots.txt` with that exact HTTPS origin. A build
  without the argument failed as intended. This does not verify a real
  domain, TLS, deployment registry, or an actual promoted image digest.

### 2026-09-29 — Language filters and layout (sections 7, 17, 21, 23–24, 29)

- A live Chromium test exercised Discover at 320 and 1710 pixels: keyboard
  access to the language menu, Russian-only empty state, Russian plus English
  results, Show all, and no page overflow. Explore preserved two selected
  languages in the URL and after reload. The case passed. Mobile WebKit and
  wider browser-specific language interactions remain to be checked.

### 2026-09-29 — Consolidated local gate after fixes

- PostgreSQL backend suite: 114 passed, 1 skipped. Ruff check and format, and
  mypy passed. The skipped backend test concerns the Nginx template being
  outside the backend image; infrastructure syntax checks cover it separately.
- Frontend Prettier, TypeScript, ESLint, 65 component tests, and the Next.js
  production build passed. The isolated full-stack browser suite passed 18/18
  across Chromium and mobile WebKit. These are local results on the dirty
  working tree, not CI results on an immutable release commit.

### 2026-09-29 — Active-tab authentication loss (sections 32, 43, 58, 102)

- A new live case exposed a missed path: the page remained focused while its
  session vanished, so a progress-save request received 403 and the play UI
  stayed on the board without explaining that the mark was unsaved.
- Protected API authentication failures now trigger one header revalidation
  for an already signed-in viewer, followed by the login explanation and a
  safe return path. Pending play selection is stored in account- and
  revision-scoped session storage; on login it is restored, saved to the
  server, and verified again after a page reload. Explicit logout, current
  session revocation, and account-deletion scheduling clear this recovery.
  The targeted live Chromium case, frontend typecheck/lint, and 9 focused
  unit tests passed. The full browser suite predates this final change.

### 2026-09-29 — Original `/create` spacing feedback (section 21)

- At the reported 1710 × 989 viewport, a signed-in author opened the cell
  inspector. The live page showed the title/settings row, upload action, and
  board separated without overlap; the toolbar ended at y=216 and the board
  began at y=310. The inspector occupied its own column and scroll region.
  No browser page errors appeared. The current CSS retains a 36-pixel toolbar
  margin when the inspector is open; no further spacing change was justified
  by this inspection.

### 2026-09-29 — Publication requirements (sections 7, 25, 43)

- A live Chromium scenario checked an empty new board through the UI. Publish
  first required a title, then a language, then at least one populated cell.
  Each rejection displayed a specific message; after completing all three,
  publication returned the newly published board. The server has a separate
  validation test for the same sequence.

### 2026-09-29 — Draft profile separation (sections 14, 16, 43, 56)

- A live author saved a titled draft and found it under the private Drafts
  profile tab. It was absent from Created; a published fixture board appeared
  there. The public profile showed neither a Drafts tab nor the draft title.
  The browser case passed and complements the server authorization test.

### 2026-09-29 — Browser-suite throttle isolation (sections 53, 72–73)

- After four new scenarios added repeated logins, a full local run passed
  21/22 tests; the last password-reset login received the intended 5/min
  backend throttle for the one shared E2E source IP. No application rate limit
  was loosened. The isolated CI and local browser stacks now use 30/min for
  login while scoped backend throttle tests retain the default rate. The local
  backend was recreated with that test setting and readiness returned 200.
  The repeat full-stack run passed 22/22 on Chromium and mobile WebKit.

### 2026-09-29 — Editor grid accessibility (sections 23–24, 72–73)

- The broader browser matrix found a critical `aria-required-children` axe
  violation while editing a cell: the inline textarea was exposed directly
  under an ARIA row. The gridcell role now belongs to the cell wrapper, which
  contains both its button and inline editor. The normal author edit/publish
  live flow passed after the change. The focused accessibility test passed in
  Chromium, mobile Chromium, Firefox, and WebKit; the full mocked browser
  matrix then passed 50 cases with six geometry checks intentionally skipped
  outside Chromium. Mocked server-side requests produce expected connection
  errors because the mock suite has no local API on port 8000. The separate
  live suite validates actual API traffic.

### 2026-09-29 — Authenticated accessibility states (sections 15, 23–24)

- A live axe scan now covers first-login language preferences, the play mark
  menu, and the signed-in cell editor. The first attempt reported controls in
  the third-party Agentation dev feedback overlay, which is absent from
  production. The isolated Compose/CI E2E frontend now disables that overlay
  while ordinary local development retains it by default. With the overlay
  disabled, the three product states passed the serious/critical axe gate.

### 2026-09-29 — Full local regression after accessibility fix

- The isolated full-stack Playwright suite passed **23/23** on Chromium and
  mobile WebKit after the editor grid fix, authenticated axe scan, and
  deterministic language-onboarding fixture reset. It covered registration,
  Mailpit verification and reset, authoring, publication, draft privacy,
  uploads, degraded network, session expiry, language filters, guest and
  registered play, social and moderation actions, access boundaries, 404s,
  cross-tab logout, and mobile sharing.
- PostgreSQL backend tests passed **114**, with **1** infrastructure-location
  skip; Ruff check and format passed. Frontend Prettier, typecheck, lint,
  **67** component tests, and Next.js production build passed. The static
  multi-browser suite passed **50**, with **6** intentionally skipped geometry
  checks outside Chromium. These are results from the isolated dirty working
  tree; the exact release commit, CI, and real deployment remain unverified.

### 2026-09-29 — Account settings, notifications, and email change (sections 26, 45–46, 53, 56)

- A live Chromium scenario created a comment, then verified that the author
  received a linked notification. Mark All Read cleared the stored unread count
  and stayed cleared after reload. Another scenario changed two preferred
  languages, bio visibility, and new-comment notifications; each setting
  persisted after reload. The deterministic test fixture now resets all of
  these preferences between runs.
- An 80-character unbroken Cyrillic display name and bio containing Chinese,
  emoji, and a long unbroken Latin string saved successfully. At 320 and 1710
  pixels, the profile retained its text and had no horizontal page overflow;
  reload preserved the content. Username and title have smaller product limits,
  so this does not claim support for 100/200-character values in those fields.
- Account settings previously had no email-change path. The new flow requires
  the current password, keeps the old address until a single-use link sent to
  the new address is confirmed, records a security event, and sends notices to
  both addresses. A live browser registered a separate user, requested the
  change, received the link and notices through Mailpit, rejected link reuse,
  and logged in using the new address. Backend tests confirmed that the old
  login stops working, a claimed address cannot be adopted, and a wrong
  password cannot reveal whether the proposed address belongs to someone else.
  Email-change request/confirmation use separate scoped limits. Nginx applies
  its auth-zone limit to both endpoints; isolated E2E uses a larger burst for
  its shared synthetic IP while the production default remains five.
- The full isolated browser suite passed **27/27** across Chromium and mobile
  WebKit after the fixture and test changes. A targeted email-change rerun
  passed after tightening validation order. Backend Ruff, mypy, migrations,
  OpenAPI equivalence, and **117** PostgreSQL tests passed, with **1**
  infrastructure-location skip. Frontend format, typecheck, lint, **67** unit
  tests, and production build passed with the new confirmation route.
  The additional test proves that a newer email-change request invalidates
  the earlier link and an expired link cannot change the account.

### 2026-09-29 — Route and browser matrix (sections 21, 23–24, 30–31, 33, 75–77, 99–100)

- A live Chromium route pass visited 17 guest-facing routes and the signed-in
  Profile, Notifications, and Create pages at both 320 and 1710 pixels. Every
  expected page returned HTTP 200; none widened the document, raised a
  JavaScript page error, or produced a 5xx network response. The authenticated
  axe gate also covered the full account-settings view after adding Change
  Email. This checks the sampled routes and states, not every possible content
  permutation or a production edge.
- The separate mocked browser matrix passed **50/50** runnable cases across
  Chromium, mobile Chromium, Firefox, and WebKit, with **6** geometry cases
  intentionally skipped outside Chromium. The test-only Next.js server logged
  expected failed proxy attempts to port 8000 because this suite mocks client
  responses and does not start a local API there. Real API traffic is covered
  by the isolated live suite.

### 2026-09-29 — Current production image smoke (sections 70, 74, 77, 103)

- Fresh production images built from the current local source: backend image
  `sha256:e85e53c58539e5f9e89f5647a60ce8721b6dfea0b3396155dd75b6b78d3c724c`
  and frontend image
  `sha256:b1d7ca99c89379fe103117fed92b454f0fd739d81f0edf94947b95591eeb30f5`.
  Both configured runtime users are non-root (`app` and `nextjs`). The frontend
  was built with a deliberately non-deployable HTTPS CI origin. A separate
  production-mode frontend container returned 200 for `/api/health`,
  `/confirm-email-change`, `/create`, and `/robots.txt`, and 404 for a missing
  bingo. This checks local startup and routing, not a signed registry artifact
  or the final public origin. The container was stopped after the smoke.
  The frontend image was rebuilt and its health/new route/create/404 probes
  rerun after the final local email-form feedback change.

### 2026-09-29 — Isolated media recovery drill (section 44)

- In the `nebqa` MinIO instance, a new uniquely named test object was copied
  from the application bucket into a separate temporary backup bucket. The
  primary key was deleted, verified absent, copied back from the backup, and
  downloaded. Original and restored SHA-256 digests matched
  (`b6d74a0934e8af64873e79f09e901f026865d641d4fcfd8aaa590f7777b1d0c3`).
  The temporary backup bucket and local files were removed. This is a
  same-instance functional drill; it does not establish off-site recovery,
  provider replication, media inventory reconciliation, or the production RPO.

### 2026-09-29 — Shared-result privacy regression (section 14)

- Auditing the result endpoint exposed an access leak: a result created from a
  public revision remained reachable through its old share URL after the author
  republished the bingo as private. Access now follows the bingo's current
  visibility and publication state, as well as the revision and result access
  flags. A deleted or moderated bingo also cannot expose an old result to a
  public visitor. The API regression confirms public access before the change,
  404 for a visitor afterward, and continued access for the owner. The full
  backend suite passed **117** tests with **1** infrastructure-location skip;
  Ruff and mypy passed on the changed service. This is local PostgreSQL test
  evidence, not a public-deployment check.

### 2026-09-30 — Clean S3-emulator install and CI recovery (sections 40, 44, 70, 72–74)

- GitHub run `36627640934` passed foundation, secret scan, backend, frontend,
  static browser matrix, and both production image jobs. Its live-stack job
  stopped before migrations because the archived MinIO Community image could
  no longer be pulled from Docker Hub; the Release gate therefore failed.
- Added a separate Compose override for new local checkouts and CI using the
  pinned SeaweedFS 4.47 image. It uses its own volume, leaving existing local
  MinIO data untouched. A separate `nebseaqa` project started from fresh
  PostgreSQL, Redis, S3, and Mailpit volumes; migrations, app health, S3
  bucket access, object write/read/delete, browser CORS, and all **28/28**
  full-stack Chromium/mobile WebKit scenarios passed. The first complete run
  had one intermittent profile-form assertion; that scenario passed 5/5
  isolated repeats, then the revised full run passed 28/28. The revised test
  checks the first input after moving to the second field. Temporary test
  volumes and credentials were removed after verification.
- The local emulator auto-creates a bucket and does not prove production IAM,
  versioning, lifecycle, or off-site recovery. Those deployment gates remain
  open.

### 2026-09-30 — Exact-commit CI gate (sections 70–73, 105)

- GitHub Actions run `36630667887` completed successfully on commit
  `d629a7153c5b33ddf6ece438bdc98faf2d428067`. Foundation configuration,
  secret scan, backend and frontend checks, static browser smoke, live
  full-stack product flows, both production-image jobs, and the aggregate
  `Release gate` all passed. GitGuardian also reported success on the PR.
- This proves the repository gate for that commit. It does not prove registry
  publication, image signing, deployment, rollback on the target platform, or
  any production-domain behavior. The PR remains a draft and unmerged.

### 2026-09-30 — Production support contact (sections 40, 70, 88)

- The production frontend image now requires a syntactically valid
  `NEXT_PUBLIC_SUPPORT_EMAIL` build argument and carries it into the runtime
  stage. A build with the required HTTPS origin but no support address failed
  at the guard as intended. A production image built with the CI-only
  `support@example.test` address; its `/support` page returned HTTP 200,
  rendered `mailto:support@example.test`, and did not render the public issue
  tracker fallback. The temporary test container was stopped.
- This does not prove that a real support inbox exists, is monitored, receives
  and answers mail, or is appropriate for privacy/security reports. The
  operator must supply and test that address before a public deployment.

### 2026-09-30 — Conditional feature inventory (sections 47–49, 54, 57, 60)

- Inspected backend URL registration, frontend page routes, application
  dependencies, and source references. This release candidate has no OAuth or
  social-login integration, payment checkout or billing, incoming webhooks,
  AI/LLM feature, or team/organization workflow. The conditional scenarios in
  sections 47–49, 54, and 57 therefore have no current product flow to test.
- There is no registered service worker or PWA manifest in the frontend
  source. Section 60 still requires a real-browser check for stale workers or
  caches on the actual deployment. Reopen these conditional sections if their
  capabilities are added before launch.

### 2026-09-30 — Guest session status and browser console (sections 14, 75–76, 82, 102)

- A fresh guest browser at `/discover` produced four console errors from two
  `/auth/me/` and two `/profiles/me/` requests returning 403. The protected
  `/auth/me/` endpoint remains strict. Public screens now use a separate
  `/auth/session/` endpoint that returns HTTP 200 with `{ "user": null }` for a
  guest or the current user for an authenticated session, with
  `Cache-Control: private, no-store`. Discover asks for profile preferences only
  when the session has a user.
- On the live QA stack, a fresh guest browser then showed zero console errors
  on `/discover`; the four session-status requests returned 200 and no private
  profile request was made. The two-width public route audit passed. Guest
  play/share, registered progress, and two-tab logout passed 3/3. Expired
  editor-session recovery and active-tab protected-action expiry passed 2/2.
  The backend suite passed 119 tests with one infrastructure-location skip,
  including the guest/authenticated session contract; frontend checks passed
  67 unit tests and two focused mocked browser checks. The mobile WebKit live
  guest play/share case also passed.
- An initial share test run used `127.0.0.1:18080` although the isolated QA
  stack trusts `localhost:18080` for CSRF. The POST was correctly rejected;
  rerunning with the configured origin passed. This local result does not
  replace a production-console inspection on the final domain.
- A local full mocked-browser run initially encountered an unrelated service
  listening on the host's port 8000: Next server rendering received that
  service's 404 before browser request mocks applied. Static Playwright now
  points server rendering to an intentionally unused loopback port. Repeating
  the full Chromium, mobile Chromium, Firefox, and WebKit suite passed 50 cases
  with six intentional geometry skips.

### 2026-09-30 — Repeated QA runs and throttle isolation (sections 53, 72–73)

- A repeated full live run on the long-lived `nebqa` stack hit the ordinary
  `120/min` anonymous limit after several earlier targeted runs shared the
  same Redis cache and source IP. The new read-only session status now has its
  own `300/min` scoped throttle, so checking login state cannot drain the
  general anonymous quota. A backend regression verifies two guest session
  reads succeed even when the general guest limit is temporarily set to
  `1/min` in the test.
- Compose exposes `ANON_RATE_LIMIT`, defaulting to the original `120/min`.
  Only the isolated CI live-browser job sets `600/min` because all synthetic
  users share one source IP. After recreating the local QA backend with that
  test value, a repeat reached the password-reset scenario and hit the
  ordinary `5/min` login limit: the local backend had lost its earlier QA
  override during recreation. Restoring the CI-equivalent `30/min` login
  setting made the targeted reset case pass. The next complete Chromium and
  mobile WebKit live suite passed **28/28**; the full backend suite passed
  **119**, with **1** infrastructure-location skip. Production defaults are
  unchanged for the general anonymous and login limits. Real shared-IP load
  and suitable production limits still need measurement.

### 2026-09-30 — Public-file exposure on production images (sections 79–81, 85)

- Built the current-source production frontend and backend images locally at
  commit `254131acd660d0ee5b6c35a73910c8ce0b0da981`. The frontend image
  digest was `sha256:4ed91be0e5f3a62ee26bb11b05b5932151f4302e4300514bfd93e92fe1be464c`;
  the backend digest was
  `sha256:46ca5a777db437048a0bc44d10fc4a6d169b626c2f1c175967274faa40b50b0d`.
  The frontend used a deliberately nondeployable `.invalid` origin and a
  CI-only `.test` support address. File inspection found no `.map` under
  `/app/public` or `/app/.next/static`, and no `.env`, database, backup, key,
  dump, or log files in the inspected application paths.
- Served the frontend production image on `127.0.0.1:65264` against the
  isolated QA stack. `/discover`, `/support`, `/icon.svg`, `/robots.txt`,
  `/api/health`, and a hashed CSS/JS asset returned 200. Requests for `.env`,
  `.git/config`, example backup/SQLite/config/test-report paths, a hashed JS
  and CSS source map, `/_next/server/app/page.js`, and Next development or
  stack-frame endpoints returned 404. Static hashed assets had immutable
  cache headers; the health response was `no-store`.
- A fresh Chromium guest visit to `/discover` rendered the board list and
  public navigation. The browser reported zero console messages, errors, or
  warnings; the network log showed successful static asset, page, prefetched
  route, and guest `/api/v1/auth/session/` responses.
- Browser source maps are intentionally private and absent from the public
  release image. No monitoring-provider map upload is configured. A new CI
  image guard rejects maps and sensitive file names from public frontend
  directories; its result awaits the next exact-commit CI run. The direct
  container check does not prove the behavior of a real domain, CDN, TLS edge,
  object store, or externally exposed backend. Repeat these probes after
  deployment before checking off the sections.

### 2026-09-30 — Mobile language and play controls (sections 21–23, 95)

- A new isolated mobile WebKit scenario opened the Discover language chooser,
  selected Russian and English, confirmed the empty/result states, and then
  switched a played cell between cross, checkmark, and diagonal marks. It also
  used Space to close and reopen the language chooser and ArrowRight to change
  the native radio selection. The first run failed because the language option
  labels measured 40 CSS pixels high against the project's 44-pixel mobile
  target. Both language and mark labels now have a 44-pixel minimum height.
- The focused WebKit scenario passed after the CSS fix; the full mobile WebKit
  live file passed 2/2. The existing Chromium keyboard/filter scenario passed
  again at 320 and 1710 pixels. Neither mobile screen had horizontal page
  overflow. Frontend ESLint and TypeScript checks passed. This proves the
  tested local browser and device emulations, not every physical device.

### 2026-09-30 — Predeployment checklist traceability (sections 72, 105)

- The original 40,643-byte user prompt remains unchanged. An editable working
  copy now includes all 105 numbered sections and 1,142 checkbox items. The
  repository verifier reverses checkbox markup and compares every original
  line, checks checklist and tracker section order, and validates the source
  SHA-256; it passed locally and is part of the CI foundation job.
- The section tracker now reports predeployment verdicts separately from
  deployment-only checks. At this snapshot, 1 section has complete local
  evidence, 57 have partial section-specific evidence, 41 await an itemized
  verdict, 5 conditional sections are N/A for this release based on the
  source inventory. These are evidence states, not a claim that 58 sections
  have passed all their original bullets. Section 74 explicitly requires a
  live deployment and is tracked separately. The public deployment remains
  unproven.

### 2026-09-30 — Rehearsed public deployment smoke (sections 38–39, 74, 77, 79–80)

- Added `infra/scripts/smoke-public.sh` with an HTTPS-only default and a
  localhost-only HTTP override for isolated rehearsal. It requires a known
  published board ID, checks public pages, one board, readiness, guest session,
  robots/sitemap origin, icon and social image, true 404s, and representative
  private paths. It also rejects a guest session response lacking `no-store`.
- `shellcheck` and `bash -n` passed. The script passed against the `nebqa`
  proxy and current public fixture board: 17 route/status probes plus the
  robots and cache-header checks. Missing HTTPS opt-in and a malformed bingo
  ID were rejected before network requests. A later replay with an ID from a
  fixture that had since been reseeded correctly failed its board probe with
  404; using the current fixture manifest ID passed all probes. The script
  has not run on a
  public domain; it does not validate email delivery, authenticated writes,
  external monitoring, or recovery after a real deployment.

### 2026-09-30 — New visitor enters Create (sections 1–3, 6, 14–15, 32, 75–76)

- A manual guest journey on the QA stack opened Discover at mobile and 1710 px,
  followed **Find a bingo** to Explore, returned with browser Back, then
  followed **Create your own** to `/create`. Before the fix, the editor made
  two protected `/auth/me/` requests, both HTTP 403, despite presenting a
  guest message. The editor now calls the guest-safe `/auth/session/` endpoint.
  A fresh guest reload had no console errors; its observed session requests
  returned 200. The protected `/auth/me/` contract remains unchanged.
- Discover's first-screen description now names the community feed and the
  two immediate actions without implying a guest already follows people or
  tags. The mobile hero still exposes the primary **Find a bingo** action.
  Eight observable first-screen bullets in section 2 are checked in the
  working copy; the problem/value wording, explicit free/paid clarity, CTA
  competition, and reader comprehension still need an itemized UX verdict.
- The guest Create state now names the action, explains the verified-account
  requirement, offers **Create account** and **Log in** links, and uses a page
  level heading. A failed session check shows a retryable error instead of
  pretending the visitor is signed out. An unverified user opening a draft
  link sees verification options instead of a permanent loading state. The
  registration link reached the Register page; the login link preserves
  `/create` as its return path.
- The live route audit passed with `/create` included at 320 and 1710 px and
  no guest 401/403 or horizontal overflow. A live author created, saved,
  edited, and published a board. Editor unit tests passed 13/13; focused
  Chromium and mobile browser accessibility/outage scenarios passed 4/4;
  frontend format, ESLint, and TypeScript checks passed. This covers the
  local guest and author flows, not real email verification after deployment.

### 2026-09-30 — Signup and login item audit (sections 7, 10–12, 23, 45, 53)

- **Valid email, verification email, and valid credentials:** the live Chromium
  journey registered a unique address, read the actual message from Mailpit,
  followed its one-time link, logged in, and saved language preferences. It
  passed again after the form changes. The same live journey submitted a
  verification-resend request and still completed with the original link;
  the backend cooldown test confirms an immediate resend preserves that link.
- **Invalid email, weak password, requirements, visibility, and Enter:** the
  browser form rejects malformed email and fewer than 12 password characters
  without posting. Its Show/Hide control preserves the entered value, is
  keyboard-operable, and has a 44 px target with no 320 px horizontal overflow.
  Pressing Enter submits the valid form. `auth-forms.spec.ts` passed 20/20
  across Chromium, mobile Chromium, Firefox, and WebKit. The reusable control
  also covers login, password reset, email change, password change, and
  account deletion forms. A component test passed for keyboard reveal/hide.
- **Server password enforcement:** registration now passes the candidate email
  and username to Django password validation, so its similarity rule actually
  runs. A small shared validator rejects obvious words padded with digits or
  punctuation. The API test rejected a short password, a padded `password`
  value, and a username-similar value without creating an account.
- **Duplicate email and recovery path:** an API test proved a verified address
  receives the same 202 response as a new address, with no new verification
  and no account/password mutation. The waiting page uses conditional copy and
  provides login and password-reset links; it does not falsely claim a new
  email was sent. The waiting page's immediate-resend feedback no longer
  promises a fresh email during the cooldown. `confirm password if used` is
  N/A: signup has no confirmation field; account password change does.
- **Expiration and old links:** backend tests cover expired verification,
  one-time use, and invalidating an earlier pending-registration link when a
  later link verifies the address. These are service tests, not a timed
  24-hour browser wait. The configured verification TTL is 86,400 seconds in
  the local Compose contract.
- **Wrong email, wrong password, unknown account, and rate limiting:** the
  login API test gives the same generic failure for wrong credentials and an
  unknown address. A new API test showed two failed attempts followed by HTTP
  429 with `Retry-After` under a reduced test threshold. The live reset flow
  confirmed an old password fails and the new password works. There is no
  remember-me option for this release; the server-side session lifetime is
  configured independently.
- **Return navigation and signed-in login:** a live expired-session journey
  returned to the intended draft after reauthentication. `safeNext` rejects
  external and authentication-page destinations. A signed-in visitor opening
  `/login?next=...` now goes to that local page; a session-check outage leaves
  the login form usable with an honest status message. The browser matrix
  exercised both states. The stale `/create` browser fixture that caused the
  prior CI smoke failure was updated to mock `/auth/session/`, the route now
  used by the editor; all four focused browser projects passed.
- **Commands and limits:** the complete account backend module passed 26/26
  on isolated PostgreSQL; frontend lint, typecheck, format and 73 unit tests
  passed. The authentication/editor accessibility gate passed 4/4 across the
  browser matrix; live registration/resend and password-reset flows passed.
  The local Docker daemon briefly stopped, then restarted; the
  first host-side pytest attempt could not resolve the Compose-only `postgres`
  hostname, so its result is not counted. Production email delivery, a live
  hostname, and real provider rate limits remain deployment-only evidence.

### 2026-09-30 — Password reset and logout item audit (sections 12–13)

- **Forgot Password and real local delivery:** the `/login` link reaches the
  form. A live Chromium journey submitted an address to the isolated backend,
  read the resulting reset message from Mailpit, followed its link, changed
  credentials, observed the old password fail and the new password work. The
  same journey forced a failed network request first and confirmed the email
  remained available for retry.
- **Public URL and expiry:** the task builds the reset link from `FRONTEND_URL`;
  a new mail-outbox test rendered
  `https://bingo.example.test/reset-password?uid=...&token=...` under an
  explicit HTTPS configuration. Production settings reject an HTTP or missing
  public origin. A second test advanced time past a 60-second test TTL and
  confirmed the API rejected the old token without changing the password.
  The actual public hostname and external mail provider are still rollout
  inputs and are not claimed to have been observed locally.
- **Reuse, changed credentials, and sessions:** the live browser received HTTP
  400 when it reused a successful reset token; a backend test confirmed the
  password hash changed and all active session records and Django sessions
  were revoked. The live browser observed its existing `/auth/me/` session
  return 403 immediately after the reset.
- **Logout and Back:** a live two-tab scenario explicitly logged out in one
  tab. The private `/auth/me/` API then returned 403; session storage progress
  in that tab and shared editor recovery were removed. Back returned to
  Discover rather than a private profile. Opening `/profile` directly showed
  the guest login state, and signing in as another user returned to that
  intended profile. The other open tab detected the lost session and left its
  private profile view. The strengthened scenario passed on the isolated
  PostgreSQL/Redis/S3/Mailpit stack. Focused TTL/public-URL backend tests
  passed 2/2. These checks do not imply the future external email service is
  configured or delivering yet.

### 2026-09-30 — Direct authorization probes and old-share media (section 14)

- An authenticated ordinary user requested `/admin/` and the User model's
  admin URL directly. Both redirected to the admin login rather than exposing
  data. The same user supplied `role=moderator`, `X-Role: moderator`, and
  `X-Is-Staff: true` to the moderation API; it returned 403 and the stored
  account remained non-staff. Existing moderation tests separately cover
  permission-gated reports and actions.
- A second account opened a private bingo ID, its draft URL, and direct PUT,
  publish, and DELETE endpoints using the owner's ID. The reads and writes
  returned 404. Deleting the owner's public bingo returned 403; both records
  remained live. Existing API tests cover owner-scoped uploads, exports,
  sessions, and private share URLs. These requests exercise server rules, not
  hidden frontend controls.
- A new media regression reproduced a privacy leak. A public board with a
  shared revision image was republished as private: the old share URL returned
  404, but a guest still received the old image URL with HTTP 200. The media
  visibility query now requires the share's current bingo to be published,
  undeleted, unhidden, and public/unlisted, and the referenced revision to be
  public/unlisted. The same test now gets 404 for guest and another account,
  while the author still gets 200. The existing hidden-bingo media regression
  also passed. The targeted test was observed failing on the old code and
  passing after the fix.
- Media responses previously allowed public caches to retain an image for one
  hour. They now send `Cache-Control: private, no-store`, so a cache cannot
  continue serving an old public image after the board becomes private. The
  regression asserts this header on the originally public response. This
  trades repeat image bandwidth for immediate visibility changes; a future
  cache optimization needs an explicit revocation mechanism.
- With `DJANGO_SETTINGS_MODULE=config.settings.test` and `USE_S3=false` to
  reproduce the CI test configuration on the isolated PostgreSQL stack, the
  complete API-boundary and security-regression modules passed 29/29. An
  initial local run inherited the development Compose `USE_S3=true` setting,
  so an unrelated upload-intent test expected local PUT but got presigned POST;
  that environment mismatch is not counted as a product failure. Real object
  storage policy and enforcement by the future public edge remain
  target-environment checks.

### 2026-09-30 — New-account onboarding and first useful action (section 15)

- On the isolated `nebqa` PostgreSQL/Redis/Mailpit stack, a new account
  registered, verified its email, logged in, and arrived on Discover rather
  than an empty dashboard. Discover describes playing and creation and offers
  both actions. Its one-step language question proposes the browser language
  when supported and permits several choices with flags and names. Saving
  preferences persisted them in the profile, applied the Discover filter, and
  removed the question. A separate account chose “Not now · show all
  languages”; the backend stored an empty preference list as the explicit
  all-language choice and kept the question dismissed after reload. The same
  browser journey had no document overflow at 320 px on Discover or Profile.
- Before the new account had content, the profile's Created, Drafts, and
  Recent plays tabs each showed a specific explanation and a useful Create or
  Find action. Shares and Following now give their own first steps; Followers
  explains what will appear. Other users retain privacy-safe empty wording.
  The live signup and skip tests passed 2/2. The focused language backend
  module passed 3/3, including an empty preference list showing both English
  and Russian boards. The setup is a single choice, so a multi-step progress
  indicator is not applicable.
- The `seed_e2e` example data is an explicit QA command, guarded to debug or
  test settings and opt-in credentials; normal startup does not load it.
  Production content therefore comes from users, and the zero-data interface
  is intentionally useful. Target-domain email delivery remains a rollout
  check, not evidence supplied by Mailpit.

### 2026-09-30 — Zero-data interface inventory (section 16)

- A live Chromium scenario on the isolated stack searched for an absent board
  and saw “No matching bingos” with advice to change filters. Before social
  activity was created, the public board showed “No comments yet”; a signed-in
  player with no notifications saw “All quiet” and a disabled Mark all as read
  button. A new editor showed empty cell labels and a disabled Save draft; its
  details step showed “No cover selected.” This scenario passed 1/1. The
  section 15 new-account scenario separately exercised empty Created, Drafts,
  and Recent plays collections with next-step links.
- A static browser scenario supplied empty feed/catalog responses and observed
  explicit empty headings on Discover, Trending, and Explore. The same pages
  passed their serious/critical axe scan; the scenario passed 1/1. Existing
  code handles empty Shares, Followers, and Following profile tabs, and the
  signup test checked the profile's first three empty tabs in the browser.
- There is no project entity separate from a bingo board, no file library
  separate from optional editor images, and no transaction, team-member,
  chart, or analytics-period interface in this release. The corresponding
  generic checklist categories were evaluated against those product
  equivalents or classified as not applicable, not treated as unseen UI.

### 2026-09-30 — Catalog search edge cases and interaction (section 17)

- A PostgreSQL API regression created five public boards and checked an empty
  query, whitespace, one-character match, case-insensitive match, no-match
  typo, Cyrillic text, emoji, and literal `%` and `_` searches. It also checked
  one match, two Summer matches, five total results across paginated pages,
  and 400 responses for over-80-character title and author queries. The test
  passed 1/1 after the fixture author name was changed so a literal `_` query
  did not correctly match every board through its author field. The main
  catalog now limits these query lengths server-side, and the title field
  limits typing to 80 characters client-side.
- Live Chromium submitted a mixed-case title with surrounding spaces using
  Enter, observed the trimmed query and matching board, reloaded to find the
  URL and input preserved, combined the query with Russian-only filtering to
  reach the no-results state, then cleared all filters and recovered the
  public board. The scenario passed 1/1. A separate live no-match search also
  showed explicit guidance.
- Static Chromium held the catalog response pending and observed `aria-busy`
  plus “Updating results…” until it arrived. Another static scenario rapidly
  changed the author suggestion query from `a` to `ad` and observed only the
  final `ad` API request after the 250 ms debounce. Both passed 1/1. The
  separate author/tag suggestion UI scenario already passed in the browser.

### 2026-09-30 — Card lists, pagination, and long values (section 18)

- The catalog API test covered zero, one, two, and five matching rows, a
  two-item page size through page three, no results after an author filter,
  and different `newest` versus `popular` ordering after the Summer search
  filter. A live Explore flow kept its selected New sort while adding a
  language filter and restored the default when all filters were cleared.
- Static Chromium used a two-page catalog fixture, clicked Next and Previous,
  observed the correct board and page URL, and reloaded page two without
  losing selection. This passed 1/1. The profile's selected tab state and
  empty Created/Drafts/Recent plays lists were already exercised by the
  new-account browser scenario. These are card and tab collections, not HTML
  data tables, so column header alignment is not applicable.
- A long-content card fixture used a maximum-length unbroken title, long
  display name, null cover/preview, and a long tag. Before the change, the
  card's tag strip hid overflow; it now wraps visible links, and title and
  author text wrap inside the card. Static Chromium at 320 and 1710 px found
  no page overflow, clipped link box, or literal `undefined`; the case passed
  1/1. Optional missing title is separately rendered as “Untitled bingo” in
  the card unit test. Card lists adapt to viewport width and need no
  horizontal scroll; the large 10×10 board has its own separately tested
  scroll region.

### 2026-09-30 — File upload and storage contract (section 19)

- Correct PNG upload and attachment, unsupported SVG, oversized cell image,
  empty PNG, extension/type mismatch, corrupt PNG content, a forced object
  storage 503, and successful retry were exercised in live Chromium. The
  invalid-file, outage/retry, and cancellation scenarios passed 3/3 after the
  local upload changes. A separate live browser scenario uploaded the same
  Unicode filename with spaces twice and received distinct asset IDs, passing
  1/1. Backend declaration and image-inspection tests reject zero bytes and
  real JPEG content declared as PNG; the media validation module passed 8/8.
- Upload intents strip both Unix and Windows path-like prefixes from display
  filenames. A PostgreSQL test exercised Unicode, spaces, traversal-like
  names, and duplicate names, then checked distinct random staging keys.
  The full media and revision modules passed 13/13 before the two added
  declaration/content tests; the focused media module passed 8/8 afterward.
- Editor cell, background, cover, and profile avatar uploads now expose
  preparation, transfer, and processing stages with an indeterminate progress
  element and a Cancel upload control. The browser-native transfer reports no
  reliable byte count across the presigned S3 POST, so progress communicates
  the current stage. The 320 px live editor test paused the storage request,
  saw the upload stage without page overflow, cancelled it without attaching
  an image, and retried successfully. Cell upload errors and cancellation now
  appear in the cell inspector, where mobile users can see them. Frontend
  upload/editor/profile unit tests passed 21/21, with lint and typecheck green.
- The owner-scoped upload intent, completion, direct-content, detail, and
  deletion API paths were exercised in the section 14 authorization tests.
  Raw corrupt bytes were rejected in the live browser; SVG is excluded; image
  validation checks the decoded format/signature/dimensions and normalization
  emits WebP without source EXIF, ICC, or XMP metadata. The local MinIO bucket
  initialization sets anonymous access to none, applies a service policy
  limited to application prefixes, and uses versioning. A direct unsigned GET
  for an existing ready object returned HTTP 403. Production storage must be
  provisioned with the runbook's private/versioned/IAM contract; its actual
  provider permissions cannot be measured until that external service exists.

### 2026-09-30 — Image delivery and semantics (section 20)

- Card previews now use native lazy loading and derived thumbnails for cell
  images and board backgrounds. Play boards use a 512 px cell thumbnail and a
  1536 px board-background thumbnail where available; the authoring editor
  retains the source image for editing. An oversized source image produced a
  512×256 WebP cell thumbnail with its aspect ratio intact in the backend
  test, which passed in the 9/9 media validation module. The live upload
  returned a ready thumbnail URL, served WebP from the media API, then used
  that URL in the published play board and Discover card. The card carried
  `loading="lazy"`, used `object-fit: cover`, and had no page overflow at 320
  or 1710 px. The live scenario passed 1/1.
- The card preview has an accessible board label while its individual images
  have empty alt attributes. Avatars are decorative beside an account link or
  name and use empty alt; broken avatar URLs fall back to the account icon or
  initial. A failed card image disappears, leaving its cell color and text;
  a failed editor cover shows “Cover unavailable.” The cover preview alt now
  includes the bingo title. Focused frontend card, play-board, avatar, cover,
  editor, and recovery tests passed 39/39. CSS cover sizing preserves aspect
  ratio by cropping rather than
  stretching; visible cell color/text serve as placeholders while lazy media
  loads. The 512 px cell, 720×450 cover, 512 px avatar, and 1536 px board
  background limits support the current board/card sizes at common high-DPI
  scales.
- Uploaded image bytes are decoded, checked for type and dimensions, rewritten
  without source metadata, served through an authorization-aware API with
  `nosniff`, and kept in private object storage (sections 14 and 19).
- Image-only cells now require an author-supplied description of at most 160
  characters before publication. The editor selects the first missing cell
  and exposes the description field; the backend independently rejects an
  undescribed image-only cell. The value survives draft normalization,
  publication, revision serialization, and local recovery, and becomes the
  play control's accessible name. A backend test rejected the missing
  description and then published and retrieved “A red kite over a field”; the
  revision module passed 8/8. The live browser attempted publication without
  a description, received the editor prompt, added one, published, and found
  the described cell on the play board. The generated OpenAPI schema and
  frontend types include the field; the database migration was applied to
  the QA stack.

### 2026-09-30 — Responsive board and short-height layouts (section 21)

- Chromium exercised the 10×10 play board, editor inspector, and finishing
  step at widths 320, 375, 390, 412, 430, 768, 1024, 1280, 1440, 1710,
  and 2560 px. The page had no horizontal overflow at each width; the large
  board deliberately scrolls inside its own region and keeps cell targets at
  least 43 px. The full responsive spec passed 6/6 in Chromium; the two
  320 px play/editor interactions passed 2/2 in WebKit. Prior live mobile
  WebKit play, share, language, and mark-selection flows also passed.
- A new 844×390 and 844×320 landscape/short-height browser test found that
  the classic brand wrapped at 844 px, growing the sticky header beyond its
  declared height and pushing the editor inspector off-screen. The responsive
  brand size now keeps the header on one line. The sticky inspector and report
  dialog use dynamic viewport units with older `vh` fallbacks. Chromium then
  kept the inspector and its close control within the 844×390, 844×320, and
  320×300 viewports. A report dialog at 320×300 scrolled its submit action
  into view and closed through Cancel. The isolated report test passed 1/1.
- The 320×300 checks simulate a reduced visual viewport after a virtual
  keyboard opens; they do not exercise a physical phone keyboard or changing
  address bar. iPhone notch/safe-area behavior and a real mobile modal with
  keyboard remain unchecked. The current release has no bottom fixed
  navigation, data tables, charts, or tooltip component in the source
  inventory, so those section-specific bullets are marked not applicable.
- CI on `c9fc40c` found one mypy failure in the thumbnail size lookup. The
  lookup now has a string-keyed annotation matching the model field; local
  backend mypy passed with no issues in 71 source files. This fix is awaiting
  the next commit's exact CI run.

### 2026-09-30 — Touch controls and CI regression repair (section 22)

- A 320 px live browser inventory found 40–42 px header actions, a 23 px
  language summary, 22 px tag links, 40 px card actions, and 18 px footer
  links. The interactive boxes now measure at least 44×44 CSS pixels in the
  mobile WebKit regression across the header, language chooser, cards, and
  footer, including the shortest tag. Adjacent navigation, tag, card-action,
  and footer controls retain gaps or separate card regions. The browser
  tapped Explore, Discover, and the language chooser and found no horizontal
  overflow. The full live mobile WebKit file passed 3/3, covering guest play,
  sharing, language selection, and mark choices as well. The responsive
  Chromium file passed 6/6 after the touch-size changes.
- The editor's drag rectangle is optional: tapping a cell opens its editor,
  and keyboard Shift+Arrow selects a range. Mobile play uses tap for marks;
  native board panning is the intentional way to reach cells of an oversized
  board. Source inventory found no mouse-only action handlers or swipe-only
  command. The few native `title` hints repeat text or supplement visible
  controls; a disabled export button visibly says “Download after
  publishing.” Thus no essential action relies on hover or tooltip text.
- CI on `5fa8fc6` passed typecheck but found a stale security-test fixture:
  its image-only cell lacked the newly required description. The fixture now
  supplies one and its targeted PostgreSQL test passed 1/1. CI also found a
  Prettier mismatch in the responsive test; it has been formatted, and the
  full frontend format, lint, and typecheck commands passed locally. The
  corrected exact-commit CI run remains pending.

### 2026-09-30 — Keyboard navigation and modal focus (section 23)

- A browser-only keyboard walk on a public bingo checked the initial skip
  link, header link, reverse Shift+Tab order, Enter opening the report dialog,
  repeated forward and reverse Tab, a visible 3 px focus outline, Escape
  closing the dialog, and focus returning to the Report trigger. The initial
  modal test caught a focus gap at the Tab wrap: Chromium and WebKit could
  leave `document.activeElement` on the page body while the dialog remained
  open. The report dialog now cycles through its enabled fields and buttons
  explicitly. The focused test passed in Chromium, Firefox, and WebKit 1/1
  each; no element behind the modal received focus.
- Existing browser flows separately use Enter to submit signup and toggle
  language filters, Space to select languages and switch mark controls,
  Escape to leave inline cell editing, arrow keys to navigate the board,
  and Shift+Arrow to select a range. The report dialog is the only native
  `<dialog>` component in the current UI; its escape path returns to the
  trigger rather than trapping the keyboard after closure.

### 2026-09-30 — Accessibility beyond the serious-error gate (section 24)

- The static Axe gate was strengthened from serious/critical only to every
  reported severity. Guest Discover, Trending, Explore, login,
  registration, Create, notifications, public play, shared result, public
  profile, and editor states passed 12/12 across Chromium, mobile Chromium,
  Firefox, and WebKit. The live authenticated gate likewise
  passed 1/1 across language onboarding, play, editor, account settings, and
  the report dialog, with no Axe violations. This covers automated rules on
  the observed states, including text contrast, labels, accessible names,
  image alternatives, and modal semantics; it does not substitute for a
  complete screen-reader or human contrast audit.
- Running the full-severity scan exposed two source issues that the earlier
  serious-only gate missed. Some streaming/loading and editor auth-error
  states briefly lacked H1; the route loading views, Create states, and play
  loading/error/unpublished states now have a page-level heading. Play and
  editor grids used `role="grid"` on `<section>`, which Axe classified as an
  inappropriate role/element pair; both now use `<div role="grid">`. The
  existing accessible grid names and keyboard behavior remain intact.
- Legacy highlight-style selected cells previously used a yellow overlay
  alone. They now also show a checkmark, while the play control continues to
  expose `aria-pressed` and a selected accessible name. The component
  regression checks the visual mark and pressed state. Editor/status errors
  use alert/status live regions; the report dialog now traps and restores
  focus in three browser engines (section 23).
- With reduced motion emulated in Chromium, the media query matched, document
  scrolling computed to `auto`, and a 1 s CSS animation computed to 0.01 ms.
  A 720 CSS-pixel viewport at device scale factor 2 (proxy for 200% zoom on
  a 1440-pixel display) had no document overflow on Discover, Explore, login,
  or guest Create. Actual browser zoom, complete heading-level ordering,
  discretionary ARIA, and non-text/UI contrast remain unchecked for this
  section.
- CI on `c323f3b` passed backend/frontend quality, browser smoke, both
  production images, foundation checks, and the secret scan. Its full-stack
  job passed 34/35 cases; the remaining mobile touch test observed a Next
  navigation between two independent DOM reads and lost its execution
  context. Touch targets and document width now come from one browser
  evaluation. The focused live mobile WebKit scenario passed 5/5 repeated
  runs after this test stabilization; exact-commit CI remains pending.

### 2026-09-30 — Visible copy and placeholder inventory (section 25)

- A case-insensitive search of user-facing frontend source found no Lorem,
  TODO/FIXME, dummy names, `example.com`, loopback addresses, staging links,
  or obsolete “Coming soon” copy. Test fixtures, CI-only `.invalid` origins,
  internal URL parsing, and local API defaults are intentional developer
  inputs; the production image build validates its public HTTPS origin before
  publishing metadata. The classic visible wordmark was the lone mismatch
  (`Not-Enough-Bingo`); it now reads “Not Enough Bingo,” matching the page
  title, footer, and sharing surfaces. Authentication links now consistently
  say “Log in,” “Back to log in,” or “Continue to log in.” Screenshots at 320
  and 844 px showed the revised wordmark fits the header without overflow.
- Privacy, Terms, and Support still contain explicit public-beta/operator
  wording and an issue-tracker fallback. They cannot be finalized honestly
  without a real operator identity, jurisdiction, and private support contact;
  the user has been asked for those inputs. Temporary legal copy, the wider
  error-message inventory, and internal-value exposure remain unchecked.

### 2026-09-30 — Long input and readable content limits (section 26)

- The live 320 px registration and editor flow pasted a 100-character
  username, over-254-character email, and 200-character bingo title. The
  fields kept 30, 254, and 70 characters respectively, matching product
  limits, with no page overflow. Username and title now state their limits
  beside the controls so a pasted value's truncation is predictable. This
  focused scenario passed 1/1.
- A live player posted a roughly 800-character unbroken URL followed by
  Chinese, emoji, and Cyrillic text as a comment. The full body remained
  readable without horizontal overflow at 320 and 1710 px; an empty comment
  could not be submitted. The focused scenario passed 1/1. A prior live
  profile scenario saved 80 unbroken Cyrillic characters as the display name
  and Chinese, emoji, and unbroken Latin text in the bio at both widths,
  then retained them after reload. The static maximum-length card test
  covered long title, author, and tag wrapping at 320/1710 px; the 10×10
  board test exposed a clipped cell's full text in the cell-detail region.
  These controls use their product-specific length limits; 100- or
  200-character names are intentionally capped rather than stored.

### 2026-09-30 — UTC storage and local date display (section 27)

- Django runs with `TIME_ZONE="UTC"` and `USE_TZ=True`; model timestamps use
  aware datetimes, and publication, profile, and notification querysets sort by
  database datetime fields. A PostgreSQL API regression published four boards
  at leap-day end, March start, year end, and new-year start. The newest feed
  returned them in exact instant order, and every serialized `published_at`
  round-tripped to its original UTC instant (1/1 targeted test passed).
- Visible notification, comment, play/share history, session, and deletion
  dates now use one browser-local formatter with a short timezone label. This
  removes ambiguity when the 1:30 AM hour repeats on the New York autumn DST
  transition. Unit checks covered both DST transitions, February 29, March 1,
  December 31, January 1, and malformed input (3/3 passed). A Chromium browser
  with `America/New_York` timezone showed the two notifications as `1:30 AM
  EDT` and `1:30 AM EST`, preserved their original ISO `dateTime` attributes,
  and had no page errors. The same browser scenario passed in Chromium,
  Firefox, and WebKit (3/3). The product does not use relative
  today/yesterday labels, so no day-boundary label logic applies.

### 2026-09-30 — Numeric boundaries and formatting (section 28)

- Visible bingo-card counts now use one formatter for nonnegative whole numbers.
  Unit tests exercised zero, one, 999, 1,500 (`1.5K`), one million, one
  billion, negative and fractional values, `null`, `undefined`, `NaN`, and
  both infinities. Invalid counts display an em dash rather than a misleading
  number; count and decimal separator formatting is deliberately English
  while the site's UI remains English (2/2 formatter tests passed).
- The editor opacity sliders present 0–100% and submit values divided by 100;
  border width is limited to 0–12. Backend draft validation now checks the
  original opacity against 0–1 before rounding to three decimals, so
  `-0.0004` and `1.0004` cannot round into a valid value. Its seven focused
  cases covered zero, one, 0.4567 → 0.457, negative/fractional out-of-range,
  `NaN`, infinity, and a thousand-digit integer (7/7 passed). Corrupted local
  draft recovery with out-of-range opacities or invalid border widths is
  rejected before its values reach the editor (recovery tests 4/4 passed).
  The backend fields use positive integer counters and bounded board sizes.
  The product has no price, payment, or currency display in this release, so
  currency formatting is not applicable.
- The complete local backend suite passed 140 tests with one existing skip;
  the frontend suite passed 90 tests in 23 files, with Prettier, ESLint,
  TypeScript, Ruff, and mypy checks passing after these changes. CI for the
  preceding `91884a2` commit passed both quality jobs, full-stack flows, and
  both production images, but its browser smoke job failed on a WebKit Explore
  suggestion test. The test typed before client hydration and saw the input
  reset; it now waits for the results view to finish loading before typing.
  The focused WebKit case passed 5/5 repeated local runs. The corrected
  exact-commit CI is still required.

### 2026-09-30 — Content language and English interface (section 29)

- The site's UI and transactional email copy are English, and root HTML has
  `lang="en"`. The multi-select preference and catalog/discover/explore
  filters select **bingo content language**, not a translated interface.
  Backend language tests cover required publication language, invalid codes,
  saved preferences, filtering, and all-language fallback; live browser flows
  cover onboarding, keyboard selection, account settings, and query-string
  URLs such as `languages=en&languages=ru`. Unknown/legacy language codes have
  a visible “Unspecified” label. There are no alternate translated site pages
  to connect with `hreflang`, and no UI translation keys to leak. Currency is
  not a capability in this release. English dates and compact counts have the
  deliberate formatting described in sections 27–28.
- Creator-written card titles, play titles/descriptions, and board cells now
  carry the selected content language; creator text uses automatic text
  direction. A 320 px Arabic card rendered its heading right-to-left with no
  horizontal overflow in Chromium and WebKit (2/2), while component checks
  verified Russian title/cell language markup. Previous long-content checks
  covered Cyrillic, Chinese, emoji, and long unbroken content at 320/1710 px.
  A count-copy review found the singular reply button said “replies”; it now
  says “View 1 reply,” while two or more say “View all N replies” (2/2 cases).
  Date/time and numeric tests are recorded above. The interface language
  remains English by design for this release; translated UI routes, localized
  emails, and language variants of the same page would be separate features.

### 2026-09-30 — Missing and legacy routes (section 30)

- The live stack's public resource test passed after adding a malformed bingo
  identifier and the former `foryoupage.html` path: each returned HTTP 404 and
  showed the “Nothing on this square” explanation plus a Discover link (1/1
  browser scenario). Existing cases in the same scenario cover unknown bingo,
  share, profile, and arbitrary routes. A separate live case proves unlisted
  direct links work while private boards return 404 to guests. The prior SSR
  fix routes actual API 404 responses through Next's `notFound()` rather than
  returning a visual error with HTTP 200. A targeted PostgreSQL API test now
  confirms a soft-deleted published bingo's detail URL returns 404 (1/1).
  No live old site is configured for migration; the legacy HTML path resolves
  cleanly to 404 in the current stack.

### 2026-09-30 — Unhandled 500 and root-layout fallback (section 31)

- Next's route-level `app/error.tsx` already gave a generic, retryable error
  state. A new `app/global-error.tsx` now handles a root layout failure with a
  self-contained HTML document, accessible heading, retry, and Discover link.
  A focused render check passed: the fallback included the required document
  tags and actions while omitting an internal exception message (1/1). Both
  boundaries log only error type and safe digest to the browser console, not
  raw exception text. This follows the Next 16 App Router global-error file
  convention checked against Context7's versioned Next documentation and the
  installed Next error-boundary implementation.
- A production-like Django test deliberately raised an unhandled DRF view
  exception with `DEBUG=False`. The result was HTTP 500 with a generic body,
  no internal detail or traceback, and an `X-Request-ID` header matching the
  supplied safe identifier; `django.request` logged the technical failure
  (1/1). The configured DRF exception handler already wraps expected API
  errors with a request ID, and request completion logs carry that ID without
  query strings or bodies. Frontend API errors translate non-JSON 5xx replies
  into a friendly service-unavailable message. External error tracking setup
  and alert delivery are assessed separately in sections 63–66.

### 2026-09-30 — Offline, slow requests, timeouts, and rollback (section 32)

- The live Chromium editor scenario used Playwright offline mode while editing a
  cell. The save status reported failure, local recovery retained the edit,
  “Retry now” saved it after reconnecting, and a reload showed the saved cell.
  The registered-player scenario aborted the reset DELETE, showed a connection
  error, restored the selected cell, then completed a real reset and confirmed
  it stayed clear after reload. A guest-player component check also retained
  the selected cell when the browser blocked local-storage removal. These
  targeted live flows passed 2/2; the focused component checks passed.
- A routed Explore search withheld the response while the results region
  remained visibly busy and said “Updating results,” then completed normally
  after release (1/1 Chromium scenario). The shared browser API client now
  aborts reads and writes after 20 seconds; unit checks covered a stalled read,
  a stalled write with an ambiguity warning, caller cancellation, and a broken
  JSON error response. CSRF bootstrap uses the same deadline. Direct object
  storage transfers and proxy upload bodies have a 120-second deadline so a
  slow large image can finish while a stalled transfer eventually exits. The
  direct-upload timeout test confirmed that processing and attachment do not
  run after the transfer fails. The editor's live image flow displayed upload
  stages, allowed cancellation, and succeeded on retry (1/1).
- Registered progress reset now clears saved recovery only after a successful
  server reset and refresh; on failure it rolls back the visible selection and
  retains a session recovery copy. Guest reset similarly rolls back when local
  storage denies deletion. Protected local and session storage reads no longer
  throw if both reading and removal fail. The full frontend suite passed 104
  tests in 24 files, with TypeScript, ESLint, and Prettier passing. The exact
  previous commit `499859d` passed all nine CI jobs; this section's commit
  still needs its own exact-head CI. Network deadlines and browser offline mode
  are local predeployment evidence; public edge and service availability remain
  launch-environment checks.

### 2026-09-30 — Browser-engine and native Safari checks (section 33, partial)

- A new live full-stack compatibility scenario exercised Discover cards and a
  two-language filter, bingo mark selection and progress after reload, an
  immutable share, then authenticated draft creation by typing directly into a
  focused cell and verifying persistence after reload. It passed in Playwright
  Firefox, desktop WebKit, Pixel 7 Chromium emulation, and the installed Google
  Chrome app (4/4). The earlier live iPhone 13 WebKit scenarios cover mobile
  guest play/share, language and mark controls, navigation targets, and narrow
  overflow; the broad static browser suite runs Chromium, Firefox, WebKit, and
  Pixel 7 emulation.
- The first desktop WebKit run exposed an intermittent page error when a pending
  analytics POST was cancelled by navigation: 1/4 failed, then 1/3 failed on
  repetition. Analytics batches now use `keepalive`, while their catch still
  prevents analytics failures from interrupting product actions. Five repeated
  WebKit runs and the subsequent four-engine run passed with no page errors.
- In the installed native Safari app, a fresh guest opened the isolated
  `/discover` stack. Selecting Russian showed the accurate empty state;
  selecting English as a second language restored the public boards. The guest
  opened a board, chose the cross mark, selected a cell, created a share link,
  and reached a read-only result showing that selected cell. Native Safari
  product behavior is observed through its accessibility tree; Playwright
  WebKit supplies the repeatable regression test.
- The Microsoft Edge app is not installed on this host. Pixel 7 and iPhone 13
  tests emulate Android Chrome and iOS Safari browser behavior; physical
  devices and their browser versions have not been tested. Those three
  checklist bullets remain open before a full section verdict.

### 2026-09-30 — Production-build performance review (section 34, partial)

- Built Next 16.3.7 in production mode against the isolated backend and ran
  `next start` on localhost:18081. Unique initial JavaScript for Discover,
  Explore, Create, and a bingo page measured approximately 144, 145, 155,
  and 149 KiB gzip respectively from the route client-reference manifests and
  shared runtime chunks. Route-specific chunks were separate. The production
  `.next/static` tree contained no Agentation bundle; the dev-only annotation
  package was moved from runtime to development dependencies without upgrading
  its locked 3.0.2 version. `npm ls --omit=dev --depth=0` then showed only
  Next, React, React DOM, and Zod as runtime dependencies.
- In headless installed Chrome against that production server, fresh 390 and
  1710 px visits to Discover, Explore, and guest Play returned HTTP 200 with
  no page errors. Browser-origin API counts were 2, 1, and 4 before the
  play-page server hydration optimization; the server supplies the public
  board/feed data in the initial response. The repeated 390/1710 px guest
  play check now has cumulative layout shift 0 in all six runs. Before the
  fix, the board moved when viewer-only buttons arrived (mobile CLS about
  0.06). Reserving the guest controls and sending the verified viewer and
  author relationship in the first server response removed that shift. The
  authenticated player measured CLS 0.0011 at 390 px and 0.0006 at 1710 px,
  with the remaining movement confined to the account header. The change
  exposed a guest-progress hydration race; a live regression and component
  check now prove a selected cell survives reload. Five targeted live browser
  scenarios covering guest/registered play, social actions, session expiry,
  and cross-tab logout passed after the repair.
- Published board assets use normalized image derivatives and thumbnails;
  offscreen card images and avatars use native lazy loading with defined
  board/avatar geometry. The site uses system Courier/Arial stacks rather
  than downloaded web fonts, so it has no font requests or unused font files.
  Backend feed/card querysets prefetch related media, tags, and author data.
  A PostgreSQL regression grew the Discover feed from one to twelve real
  published boards and required the SQL query count to stay within two of
  the one-board count (1/1 passed). Feed pagination defaults to 24 and caps
  public feed pages at 24; relevant bingo, social, account, and analytics
  filter/sort indexes were reviewed in model definitions and migrations.
- The local Nginx proxy now compresses text/JSON responses over 1 KiB. A live
  `Accept-Encoding: gzip` Discover API response fell from 9,054 to 1,621
  transmitted bytes; `nginx -t` passed after reload. The full-stack CI adds
  a gzip response assertion. A production Next hashed JavaScript asset served
  `Cache-Control: public, max-age=31536000, immutable`; dynamic bingo HTML
  served `private, no-cache, no-store`. Public media uses versioned asset
  identities and private downloads use `private, no-store`. The source scan
  found no production third-party scripts, and Agentation is development-only.
  A static-asset CDN decision and real external-network/load measurements
  depend on the target hosting design, so the section remains partial.
- A parallel local QA run exposed a development-stack limit: threaded Django
  `runserver` had accumulated about 100 idle PostgreSQL connections and then
  rejected both pytest setup and live fixture seeding. Development settings
  now close each request's database connection (`CONN_MAX_AGE=0`); production
  settings still use their configured pool lifetime. After recreating the
  local backend, PostgreSQL had one idle connection rather than about 100.
  Rerun sequentially, the full backend suite passed 142 tests with one skip,
  and the four-engine live compatibility scenario passed 4/4. PostgreSQL still
  showed only one idle connection afterward. Ruff and mypy also passed.

### 2026-09-30 — System-font rendering (section 35)

- CSS uses `Courier New, Courier, monospace` for the main interface and
  `Arial, Helvetica, sans-serif` in specified controls. There is no
  `@font-face`, `next/font`, or `.woff`, `.ttf`, `.otf`, or `.eot` asset in the
  frontend source or production static build. Font-file presence and
  case-sensitive asset paths are therefore not applicable, and no font request
  can produce a font 404. Browser-provided regular and bold faces cover the
  weights the interface uses, with generic family fallbacks; system text is
  visible immediately without a remote font download or swap.
- The live multilingual profile scenario displayed long Cyrillic, Chinese,
  emoji, and unbroken Latin content without clipping at 320 and 1710 px
  (1/1 targeted Chromium run). Earlier Arabic and Russian card/board checks
  passed in Chromium and WebKit. These validate product text rendering on
  actual content; glyph availability ultimately follows each user's system
  fonts and the declared browser fallback stack.

### 2026-09-30 — Public-page SEO and preview isolation (section 36, partial)

- A fresh production-mode Next 16.3.7 build served on localhost:18081 was
  started twice from the same build. With `APP_ENVIRONMENT=staging`,
  `robots.txt` returned `Disallow: /`, `sitemap.xml` had no entries, Discover
  sent `X-Robots-Tag: noindex, nofollow`, and its rendered HTML included a
  noindex meta tag. With `APP_ENVIRONMENT=production`, robots advertised the
  exact configured HTTPS sitemap origin, the sitemap listed public routes,
  Discover had a canonical HTTPS URL without noindex, and the published
  fixture bingo carried `index, follow` and its own canonical URL. The
  frontend production image now defaults to staging until its runtime
  environment is explicitly set to production; the deployment guide and
  smoke script enforce the intended public policy.
- The isolated Nginx frontend returned HTTP 308 from
  `/discover/?languages=en&page=2` to `/discover?languages=en&page=2`.
  Missing bingo and unknown pages returned real 404 statuses in the earlier
  route checks. In a production Chromium session at 390 and 1710 px,
  Discover, Trending, Explore, and a published bingo each returned 200,
  had distinct page titles and descriptions, one visible H1 after streaming
  settled, and a canonical HTTPS link. The public feed HTML exposed normal
  `<a href>` links to boards and navigation; no route produced a page error
  or horizontal overflow. The production build, full 108-test frontend suite,
  lint, typecheck, Prettier, ShellCheck, and the local public smoke script
  passed after this change.
- The present sitemap endpoint limits its public bingo projection to 10,000
  rows and exposes `truncated=true` beyond that. This is above the current
  fixture scale but needs a paginated sitemap before that growth threshold.
  Complete heading-level auditing, human-facing URL policy, host alias and
  HTTP-to-HTTPS behavior, duplicate URLs across hosts, and a real search
  crawler remain unchecked until the hosting target and domain are chosen.
  No structured-data type directly describes a user-created bingo board;
  schema markup was intentionally omitted rather than inventing a type.

### 2026-09-30 — CI browser regression follow-up (sections 4, 33, 46)

- The `f9617d6` full-stack CI run failed two of forty live scenarios while
  its other seven jobs passed. The saved Chromium trace showed the comment
  form visible before client hydration; a fast textarea fill was then lost
  when React took over, leaving Post comment disabled. The form now appears
  only after its initial comments request has settled, so users cannot type
  into an unhydrated control. The focused notification/comment browser path
  passed against the isolated stack (1/1).
- The saved WebKit trace showed a successful CSRF GET followed by a browser
  page error from a second CSRF fetch started by the background interaction
  batch during navigation. The bootstrap GET now uses fetch `keepalive`, as
  its analytics POST already did. A unit check verifies that option; the
  cross-browser WebKit journey then passed five consecutive local repeats.
  These repairs still require the exact new-commit CI release gate.

### 2026-09-30 — Social-link preview metadata (section 37, partial)

- Parsed the actual HTML for Discover, a public bingo, a public profile, and
  an immutable shared result. Before the fix, the board and result had no
  `og:image`, and Discover's automatic image URL pointed at
  `localhost:3000` while the QA site ran on `localhost:18080`. Explicit
  image metadata now uses the configured absolute site origin for the global
  card, each board's generated preview, and each shared result's selected
  cell snapshot. All four pages returned matching Open Graph title,
  description, 1200×630 image URL, and Twitter large-image metadata. The
  profile uses the branded global card with its own title and description.
- Rebuilt production Next with a controlled HTTPS `.invalid` origin, then
  started that build in production mode. Its Discover, bingo, profile, and
  shared-result HTML all used that exact HTTPS origin for both `og:image`
  and `twitter:image`; titles/descriptions and 1200×630 dimensions were
  present. The `.invalid` value is a CI fixture, never a deployable domain.
- HTTP GET of the global, board, and shared-result image routes returned PNG
  200 at exactly 1200×630. Visual inspection showed readable titles, a
  branded footer, the bingo grid, and the two selected cells on the result.
  The site's 64×64 bingo-grid favicon was present in the rendered page. Unit
  metadata tests for board and share image URLs passed. Real Telegram,
  Discord, Slack, iMessage/WhatsApp, and LinkedIn unfurls need a public HTTPS
  domain; localhost cannot produce evidence for those services. The final
  host must also be checked for cached/stale preview metadata.

### 2026-09-30 — Production configuration and secret boundaries (sections 38, 40–41)

- Django production settings now skip the root developer `.env`, require
  `APP_ENVIRONMENT=production`, and reject a frontend HTTPS origin that is
  local, has a path, or disagrees with `ALLOWED_HOSTS` and
  `CSRF_TRUSTED_ORIGINS`. Four focused production-configuration tests passed
  with one infrastructure-template skip; the full PostgreSQL-backed backend
  suite passed 143 with one skip, and Ruff/mypy passed on changed settings.
  The release guide already lists the production database, Redis, private S3,
  transactional SMTP, trusted proxy, monitoring, cookie, and analytics
  inputs. OAuth, payment, and webhooks are absent; Celery Beat does not use a
  separate cron secret. Actual provider values and error-monitoring DSN have
  not been supplied, so section 40 remains partial.
- The frontend production image records the exact `NEXT_PUBLIC_APP_URL` used
  at build time and validates it again before Next starts. A staged CI-origin
  image booted as the unprivileged `nextjs` user, returned health 200, and
  blocked indexing. The same image refused both `APP_ENVIRONMENT=production`
  with its `.invalid` origin and a changed runtime origin. A second image
  built with a syntactically public HTTPS origin started in production mode;
  its robots sitemap, Discover canonical link, and Open Graph image all used
  that origin. These are local hostnames for a deployment rehearsal, not a
  claim that the real domain exists. A frontend unit check also rejects
  loopback, `.invalid`, and malformed public origins. Full frontend tests
  passed 110/110; ESLint, TypeScript, and Prettier passed.
- The repository has no tracked `.env` or private key file in the searched
  paths or history; `.gitignore` and both Docker build contexts exclude
  environment files and key material. The exact `af2910a` CI complete-history
  Gitleaks job passed. A production static-bundle marker search found none
  of the known development credentials or backend secret variable names.
  No real production secret was present to rotate. Real provider credentials
  must come from the chosen secret manager during deployment.

### 2026-09-30 — Cross-browser session isolation in CI (section 33, partial)

- The `af2910a` full-stack CI job passed 37 of 40 scenarios and failed in
  Firefox, WebKit, and Android emulation after the two-tab logout scenario.
  All three failure snapshots showed the legitimate guest Create screen:
  the compatibility test had reloaded a saved author session cookie that
  the earlier logout had deliberately revoked. The compatibility test now
  signs in through the browser instead of reusing that stale cookie. On the
  isolated QA stack with CI's `30/m` login allowance, the ordered sequence
  of two-tab logout followed by Firefox, WebKit, and Android compatibility
  passed 4/4. Exact-commit full CI remains required; this observation does
  not establish physical device support.

### 2026-09-30 — Existing-data migration and isolated database restore (section 42, partial)

- A fresh PostgreSQL schema still has no model changes pending under
  `makemigrations --check --dry-run`. The `0003` publication repair migration
  previously loaded first-publication timestamps for every revision into one
  dictionary; it now reads and updates published boards in bounded batches
  of 500. A transactional migration test downgraded an existing database to
  `0002`, changed a published board's old metadata, and reapplied `0003`–`0005`.
  The author, three boards, original publication time, latest publication
  time, current title, and cell survived. The test uses a two-record batch
  setting to exercise both a full and a final partial batch. The full backend
  suite passed 144 tests with one skip after this change. This exercises
  migration mechanics, not actual high-volume database performance.
- The repository's PostgreSQL backup script produced a custom-format dump of
  the isolated QA database and a SHA-256 checksum that verified. The dump was
  restored to a separate temporary database, leaving the QA source database
  intact. Source and restored counts matched for users, bingo boards, and
  migration records: `3|7|59`. The temporary database and dump were removed.
  This is a local recovery drill; no managed snapshot, WAL recovery, off-site
  retention, provider permissions, or production restore time was tested.
- The existing language migration adds `und` for old boards because their
  historical published language cannot always be reconstructed from a mutable
  draft. This is acceptable for local pre-language fixtures, but any real
  legacy import must supply an explicit language mapping before public
  migration. Remaining database bullets require index/constraint inspection,
  high-volume testing, and a target-platform backup and rollback drill.

### 2026-09-30 — HTTP security headers and cookies (sections 50–51, partial)

- A live QA GET of `/discover` returned nonce-bearing CSP, `nosniff`, frame
  denial, `strict-origin-when-cross-origin`, and a restrictive
  Permissions-Policy. An API health response also returned its separate
  `default-src 'none'` CSP and frame denial. Production CSP unit checks cover
  nonce-protected scripts and reject development HTTP origins; existing
  browser journeys found no blocking CSP console errors on the sampled flows.
  QA uses plain HTTP and intentionally sends `Strict-Transport-Security:
  max-age=0`. Django production requires positive HSTS and the runbook stages
  the Nginx HSTS value, but actual TLS-edge behavior is still unverified.
- Django's production settings force session and CSRF cookies to `Secure`;
  the production-configuration test loads those settings. The session cookie
  is `HttpOnly`, while the CSRF cookie intentionally remains readable so the
  frontend can send the CSRF header. Both use `SameSite=Lax`; the live QA CSRF
  response showed `Path=/` and `SameSite=Lax`. Existing API and two-tab
  browser tests exercised logout and session revocation. Final cookie expiry
  policy and the host-only/path behavior on the actual public origin remain
  unchecked.

### 2026-09-30 — Local readiness responses (section 67, partial)

- The QA `/api/v1/health/ready/` returned HTTP 200 with only database,
  migration, and cache status (`ok`). `/api/v1/health/beat/` returned a recent
  scheduler heartbeat; the existing test covers recent and stale states.
  `/api/v1/health/live/` and the frontend `/api/health` support process-level
  probes. No response included credentials or provider configuration.
- Storage and transactional email are exercised in separate product flows,
  not the high-frequency readiness route. Provider-specific availability and
  the external monitor cannot be verified until a hosting target exists.

### 2026-09-30 — Structured operational logs (section 64, partial)

- The backend JSON formatter emits UTC timestamp, severity, service and
  environment, optional release, request ID, method, route, status, duration,
  and bounded task failure fields. Its test confirms a query-string token is
  omitted from request completion logs and headers/bodies are not serialized.
  The backend suite passed 144 tests with one skip. The formatter can still
  include arbitrary text from a third-party logger or an exception traceback;
  an exhaustive secret-redaction review remains open. Production log sink and
  access/retention controls also depend on the hosting platform.

### 2026-09-30 — CORS and trusted-origin boundary (section 83, partial)

- A QA browser preflight to the login API with its configured local origin
  returned HTTP 200, that exact `Access-Control-Allow-Origin`, credentials,
  methods, and CSRF header allowance. The same preflight from an unrelated
  HTTPS origin returned no CORS allow-origin or credentials header. The
  already exercised browser login and CSRF flows use the same-origin route.
- Django production settings already reject wildcard and non-HTTPS CORS
  origins. They now also reject local hostnames in extra CSRF or CORS origins,
  including `https://localhost` and `https://127.0.0.1`; two new focused
  configuration cases passed (`6 passed, 1 infrastructure skip` in the
  production-config test file). The public frontend is same-origin by
  default, so an empty CORS list is valid. An actual staging origin and its
  cookie/preflight behavior must be checked when that environment is chosen.

### 2026-09-30 — Deterministic test accounts (section 86, partial)

- The `seed_e2e` command labels its fixtures with `E2E`/`.test`, requires an
  explicit opt-in and password, and refuses to run unless Django is in DEBUG
  or test settings. A backend test proved it rejects production settings even
  when the opt-in variable is present; the full backend suite passed 146 tests
  with one skip. The fixture moderator is a superuser in QA, so the actual
  production database must be checked for fixture accounts before launch.
- No payment implementation or payment sandbox exists in this release, so
  test payments cannot pollute a live payment system. Staging/production
  database separation remains an external deployment choice.

### 2026-09-30 — Exact-commit CI release gate (`15137e4`)

- All nine CI jobs completed successfully for `15137e4`: repository secret
  scan, frontend quality/tests, foundation configuration, backend
  quality/tests, browser smoke, full-stack product flows, frontend/backend
  production images, and the aggregate Release gate. This validates that
  commit only; the subsequent local CORS/configuration and tracker edits
  require their own exact-head CI run after push.

### 2026-09-30 — Scheduler and worker scale (sections 68–69, partial)

- The isolated Compose backend, Redis, worker, and Beat were running and
  healthy. Celery inspection showed one online worker consuming the durable
  default `celery` queue with acknowledgements enabled. The Beat heartbeat
  route returned a recent timestamp; code and tests cover a stale heartbeat.
  Django uses UTC and the configured schedules run every minute, quarter
  hour, hour, or day according to the task. Celery retry/failure signals emit
  structured task names, IDs, attempt counts, and exception types.
- The trending recomputation previously kept all event aggregates in memory
  and issued one board update per published board. It now aggregates events
  and bulk-updates boards in at most 500-board batches. A regression case
  exercised a full and final partial batch, recent authenticated/guest
  events, an expired event, and boards without events. Existing repeatability
  and public-visibility cases also passed. The full backend suite passed 147
  tests with one skip, and mypy found no issues in 71 source files. This is a
  bounded-query design check, not a load test on millions of events.
- The production platform still needs a single scheduler instance, queue
  persistence/visibility policy, failure alerts, and an operator procedure
  for stuck or exhausted jobs. The local run does not establish those
  external guarantees.

### 2026-09-30 — Cache policy mapped to release checks (section 59, partial)

- The QA Discover HTML returned `no-cache, must-revalidate`, and the
  authenticated session API returned `private, no-store`. Earlier
  production-mode checks observed a dynamic bingo page with
  `private, no-cache, no-store` and a hashed Next asset with a one-year
  immutable cache header. Browser Back and second-tab logout checks removed
  private views after revocation. Source inventory found no service worker or
  PWA manifest to pin an obsolete build.
- A real old-JavaScript/new-HTML transition and CDN purge/invalidation cannot
  be exercised until a deployment strategy and public cache layer exist.

### 2026-09-30 — Redirect behavior (section 78, partial)

- QA `/` reached Discover in one redirect and returned HTTP 200. A trailing
  slash on `/discover/?languages=en&page=2` returned HTTP 308 with the same
  query on the canonical path; following it took one redirect to HTTP 200.
  Existing browser flows cover safe login return navigation and logout to a
  guest state. No redirect loop appeared in these sampled paths.
- There is no deployed old hostname or prior public URL inventory. The
  actual edge must define HTTP→HTTPS and chosen `www`/non-`www` canonical
  behavior before launch; those cannot be asserted on localhost.

### 2026-09-30 — Browser and Apple icons (sections 91–92)

- The existing grid/check SVG was rasterized into a three-size ICO
  (32/48/256 px) and a padded 180×180 PNG Apple touch icon. The PNG was
  visually inspected and matches the source mark. QA now returns HTTP 200
  with `image/x-icon` for `/favicon.ico` and `image/png` for
  `/apple-icon.png`; before this change `/favicon.ico` returned 404. The
  rendered Discover head links both new assets and the SVG icon.
- Earlier production-mode HTML checks covered title, description, canonical,
  Open Graph title/description/image/URL, and Twitter card metadata on
  Discover, a public bingo, profile, and shared result. The icon links close
  the remaining page-metadata item. A PWA is not part of this release; visual
  contrast of the favicon in light and dark browser chrome remains open.

### 2026-09-30 — Scroll and report modal repair (sections 93–94)

- In live Chromium at 390×640, navigating from a scrolled Discover page to
  Explore started the new route at the top; returning from a footer link to
  Privacy restored Discover to its previous 1625px scroll position. At
  1710×989, the `#comments` anchor left the heading below the sticky header,
  and the skip link left Discover's H1 visible below it. The sampled pages
  had no horizontal document overflow at either width.
- A report dialog on a long board previously allowed the mouse wheel to move
  the page behind it by 610px. The dialog now locks root/body overflow while
  open and restores both prior inline values on close. A focused live browser
  regression passed: at 390×640 the wheel left background scroll unchanged,
  Escape closed the dialog, and wheel scrolling worked again. TypeScript and
  ESLint passed after the change.
- Manual mobile checks at 390×320 showed the dialog constrained to 276px of
  the 320px viewport with its 543px content independently scrollable. Close
  X, Cancel, Escape, and intentional backdrop click each closed it and
  restored scrolling. The earlier cross-browser focus-trap/return check also
  passed. The report dialog is the only native modal in this release and does
  not perform a destructive action; account deletion has a separate
  confirmation flow.

### 2026-09-30 — Exact-commit CI release gate (`0d7f2ad`)

- All nine CI jobs passed for `0d7f2ad`, including backend/frontend quality,
  browser smoke, full-stack product flows, production image builds, secret
  scan, foundation checks, and the aggregate Release gate. The later
  trending, icon, modal, and tracker edits need a new exact-head run.

### 2026-09-30 — Admin hard-delete safety (section 87, partial)

- Django Admin already requires active staff authentication and model
  permissions. Its registered models expose search/filter lists with
  pagination; moderation actions call the service that writes an audit
  record. The default site-wide `delete_selected` action is now disabled.
  Direct GET and POST to the admin hard-delete views for a user and bingo
  returned HTTP 403 even for a superuser, and both records remained. A
  separate Tag admin action query confirmed the bulk-delete action is absent
  from a model where deletion is otherwise allowed. The backend suite passed
  150 tests with one skip; Ruff and mypy passed.
- All seven custom moderation actions now open a confirmation page showing
  the action, count, and each selected report's ID, target type, reason, and
  status before applying it. A backend HTTP test proved
  the first POST leaves content and the action log untouched, while the
  confirmed POST hides the board and records the moderation action. Two more
  probes confirmed that `select_across=1` and a 21-report submission are
  rejected without creating an action; the per-action maximum is 20 reports.
  The three focused admin tests passed. On the live QA stack, the page was
  readable at 1710×989 and 390×844, and Cancel returned to the report list;
  the report stayed open, the bingo stayed visible, and no action was logged.
  The production runbook requires a
  staff VPN/identity gateway and MFA in front of `/admin/`; no target gateway
  exists to test.

### 2026-09-30 — WebKit live-flow CI diagnosis (`fbd1742`)

- The run passed 40 of 41 full-stack browser scenarios and all other jobs.
  Its WebKit failure was the strict page-error assertion at the end of the
  editor reload scenario. The CI trace shows the saved draft rendered after
  reload; the sole page error originated in Next.js development tools while
  fetching `/__nextjs_original-stack-frames` after reload aborted an earlier
  RSC request. The test now excludes only that devtools-origin stack-frame
  lookup error and continues to fail on application page errors. The same
  scenario passed locally in Firefox, WebKit, and Android emulation; TypeScript,
  ESLint, and Prettier passed. The next exact-commit CI run remains required.

### 2026-09-30 — Footer and legal links (sections 89–90)

- The footer now renders the current UTC year with the Not Enough Bingo name.
  It exposes Privacy, Terms, Cookies, Community guidelines, and Contact &
  support. The privacy page has a factual section describing the app's
  first-party session/CSRF cookies and local/session storage. Its Cookies link
  points to that section; the anchor heading appeared at the top of a 390px
  viewport. The root layout already renders per request, so the year is not
  frozen at build time.
- A mobile browser clicked all five footer links; every destination had its
  expected title, the cookies hash resolved, and none caused horizontal
  overflow. At 1710px the footer also fit without overflow. No console errors
  were observed. No official social accounts are configured, so adding social
  links would invent a destination; this is N/A for the current release. The
  footer has no accidental `#` placeholder links.
- The legal/contact gate remains open: the support page currently falls back
  to the public project issue tracker. A monitored private contact, real
  operator identity, jurisdiction, and review of the published legal text
  need confirmed deployment details. A working link alone does not establish
  a production support channel.

### 2026-09-30 — Action feedback and toast applicability (sections 97–98)

- Source inventory found no toast component or toast dependency. The app uses
  persistent inline `status`/`alert` regions, so toast duration, duplication,
  overlap, and success/error toast checks are not applicable to this release.
- The editor visibly transitions through Unsaved changes, Saving, Saved, and
  Save failed with Retry; live product flows passed normal saving and an
  offline failure/retry. Uploads expose preparing/uploading/processing stages,
  cancel, and failure/retry; corresponding live browser tests passed.
  Publication validation and successful publish, and report submission with
  a received confirmation, passed the live product flows. Error text is
  retained in the relevant form/status area.
- In a live QA browser, cancelling the account-deletion confirmation left the
  user on the profile. Accepting it redirected to login with a notice that
  deletion was scheduled and sessions ended. A fresh login showed the scheduled
  date; Cancel deletion restored the normal controls and displayed “Account
  deletion cancelled.” The backend deletion/grace-period tests and frontend
  settings tests also passed. Invite and payment actions do not exist in the
  release, so those two source bullets are N/A.

### 2026-09-30 — CI flow updates after admin confirmation (`8a2e559`)

- The `8a2e559` run passed backend/frontend quality, smoke, images, foundation,
  and secret scanning. Full-stack flows failed because the moderator scenario
  still expected the old one-click action, and one mobile geometry read raced a
  Next.js development-navigation context replacement. The moderator browser
  scenario now verifies the intermediate confirmation page and submits it;
  the mobile test retries the same full geometry assertions for up to 10
  seconds if navigation replaces the document. The affected two-scenario
  Chromium moderation sequence passed locally 2/2 and the mobile WebKit
  scenario passed locally 1/1. The next exact-commit CI run is pending.

### 2026-09-30 — Dropdown and popover controls (section 95)

- Existing live browser flows exercised the inline language disclosure by
  keyboard and mobile touch. A new QA walkthrough opened the published-version
  download disclosure in the editor at 390px, 320px, and 1710px. The absolute
  options panel stayed within each viewport (at 320px, x=14–306 and
  y=502–592); its parent does not clip it. Space closed the disclosure and
  Enter reopened it. On scroll the panel moved with its summary and kept the
  4px anchor gap; it did not remain detached or overlap the sticky header.
  Browser console had no errors.
- This walkthrough found the two download options were 43px high on mobile.
  Their minimum height is now 44px, with a visible separator and hover state;
  a live geometry recheck measured 44px and 44.2px. The language disclosure
  expands inline, so floating-layer clipping/edge positioning does not apply
  to it. The popup uses a bounded z-index of 5 below the sticky header's 30.

### 2026-09-30 — Overlay stack (section 96)

- In a live 390×640 browser, the report dialog matched the native `:modal`
  top layer and intercepted a hit test over the sticky header; its z-index was
  80 versus the header's 30, and root/body scrolling was locked. Escape closed
  the dialog, returned the hit test to the header link, and restored both
  overflow styles. The editor's mobile inspector uses a deliberate 40 layer;
  the download popup uses 5 and stayed below the header while scrolling.
  The skip link uses 100 so it remains reachable when focused outside a modal.
- The current UI has no custom toast, tooltip, or date-picker overlay. Browser
  `title` hints are native rather than app-managed floating layers; the
  checked source bullets for these three are N/A in this release. The stack
  uses bounded layer values instead of arbitrary extreme numbers.

### 2026-09-30 — Refresh and independent deep links (sections 99–100)

- Fresh guest tabs opened Explore with a query, a public bingo, an immutable
  shared result, a public author profile, Forgot Password, a reset-password
  form with an invalid token, and Create directly. Each returned HTTP 200,
  showed the expected page, and did so again after a hard reload. The board
  check waited for its actual title after the temporary loading
  heading; both first load and refresh resolved to “E2E Public Board.” The
  shared result and profile likewise loaded fixture content without prior
  navigation. Existing live flows had already verified editor save/recovery
  across refresh, password-reset link handling, and an authenticated profile
  in a second tab.
- There is no dashboard, checkout-success page, or OAuth callback in this
  release; those three original refresh bullets are N/A. This evidence is
  from the QA stack, not a public deployment; production routing will still
  get its narrow live smoke check during rollout.

### 2026-09-30 — Concurrent session-expiry feedback (section 102)

- The header previously started one `/auth/session/` request for each
  `auth-required` event, so concurrent protected API failures could trigger
  duplicate rechecks. It now holds an in-flight guard until the check settles.
  A component regression test dispatched three simultaneous events after an
  authenticated state and observed exactly one new session request, one
  explanatory login redirect, and no further recheck after the user became
  anonymous. The targeted unit test passed.
- The two live Chromium session-expiry scenarios passed again: unsaved editor
  text was recovered on the original draft after login, and a failed play
  progress write redirected to login without focus change, then saved the
  pending mark and retained it after reload. Both showed the session-ended
  explanation and preserved the intended return URL.

### 2026-09-30 — Exact-commit CI release gate (`c4bc4e2`)

- All nine jobs passed for `c4bc4e2`: backend and frontend quality/tests,
  browser smoke, full-stack product flows, both production images,
  foundation configuration, secret scan, and the aggregate Release gate.
  The later dropdown-size, overlay/deep-link audit, and concurrent-session
  changes require a new exact-head run.

### 2026-09-30 — Multiple browser tabs (section 101)

- The existing live two-tab flow logged out in one tab, confirmed the other
  tab redirected from private profile data with an expiry explanation, cleared
  local editor recovery, and observed a subsequent login as another account.
- Added two live Chromium scenarios and ran them against the isolated `nebqa`
  stack with Mailpit (`E2E_LIVE=1`, Playwright `live-chromium`, focused two-test
  selection): **2 passed**. Both tabs opened the same server draft before
  editing. The second save received HTTP 412, displayed the conflict action,
  retained its unsaved title, and saved it only after the user chose “Keep and
  save mine.” The first tab then reloaded and displayed that current server
  title. Both tabs also submitted a like for one board at the same time; one
  response was 201, the other 200, and the persisted count rose by exactly one.
- Authentication uses a Django `cached_db` session cookie with no refresh-token
  endpoint or client token rotation (`SESSION_ENGINE` and auth routes reviewed).
  The source checklist's token-refresh case is N/A for this release; session
  invalidation and expiry are covered by the two-tab flow and section 102.

### 2026-09-30 — Privacy data flow and account export (section 55, partial)

- The Privacy page describes account, content, media, interaction, guest-ID,
  cookie/storage, retention, export, and deletion data. The target operator and
  processors are still generic because no public deployment provider or legal
  identity has been supplied; the policy and Terms need review for the actual
  jurisdiction and any consent requirements before release.
- Reviewed the raw interaction retention task and account deletion worker.
  Found that the saved language preferences survived account anonymization and
  were absent from the downloadable account archive. Deletion now clears both
  the language list and its confirmation flag; the archive now includes those
  preferences plus bingo/revision language and marking configuration. Focused
  backend export/deletion tests passed **2/2**; Ruff lint and format passed.
- An authenticated QA browser requested an account export from Profile,
  observed the ready message, downloaded the protected attachment, and
  confirmed ZIP bytes (**1/1 live Chromium scenario**). The existing worker
  test covers completion of scheduled deletion and revoked sessions.
- Nginx access logs record `$uri` without query strings; Django's structured
  request logger records path, route, status, and duration without bodies or
  headers. Export archives exclude password hashes, session keys, and token
  hashes. These are local safeguards; the full password/token logging bullets
  remain open until target CDN and error-provider telemetry are inspected.
- Recovery and verification links necessarily use short-lived tokens in URL
  parameters. Their browser history/referrer handling and the actual CDN edge
  need a focused review before the sensitive-query item can be checked.

### 2026-09-30 — Feature controls and rollback mapping (sections 84, 104, partial)

- Source inventory found no remote feature-flag provider or client query
  parameter that grants debug/staff behavior. `frontend/app/layout.tsx` renders
  Agentation only when `NODE_ENV=development`, whereas the production Docker
  image builds and runs with `NODE_ENV=production`. Production Django settings
  reject `DEBUG=true`, and the E2E seed command refuses production settings.
  A wider unfinished-feature inventory is still needed; this is not a claim
  that every release feature is complete. The remote-flag fallback item is
  N/A while no such service exists.
- Post-baseline schema migrations add fields or alter one field; the
  publication metadata repair is an additive data migration with a no-op
  reverse operation. Its existing-data test downgraded `bingos` to `0002` and
  reapplied `0003`–`0005` without losing an author or published board content.
  That supports application-image rollback with the forward schema, not a
  destructive database rollback. No public deployment, prior image digest,
  platform command, or retained production config exists to verify the other
  rollback bullets. There is no remote flag to turn off during an incident.

### 2026-09-30 — Exact-commit CI release gate (`37e6fbb`)

- All nine CI jobs passed for `37e6fbb`: backend/frontend quality, browser
  smoke, full-stack product flows, both production images, foundation
  configuration, secret scan, and Release gate. The later multiple-tab,
  export, deletion, and checklist changes require their own exact-head run.

### 2026-09-30 — Search analytics minimization (sections 55, 61–62, partial)

- Found that Explore sent free-text search, author, and tag filter values to
  first-party interaction analytics even though counting searches does not
  require them. The client now sends only categorical surface/ordering. The
  server accepts old-client event shapes during rollout but strips `query`,
  `author`, and `tags` before storage. This also prevents arbitrary passwords,
  tokens, or private phrases typed into those form values from entering new
  analytics rows. The metadata serializer continues to constrain accepted
  categorical values and reject sensitive metadata key names. There is no
  private-messaging feature to generate message analytics in this release.
- Added a bounded keyset migration that removes already-stored search query
  text and free-text filter metadata, with no reverse restoration of sensitive
  values. Focused API and migration tests passed **2/2**; the migration applied
  successfully to the isolated QA database. Explore's real search/filter,
  reload, and clear browser flow passed **1/1 live Chromium** after the change.
- First-party interaction records include board views/opens, starts, and
  completions, while `User.date_joined` and published-board records support
  basic registered/core-action counts. There is no complete visitor-to-return
  funnel, signup/login/primary-CTA event series, production property, or
  operator report yet. Payment success is N/A because payments do not exist.

### 2026-09-30 — Reset and deletion safeguards (sections 5, 9, partial)

- The existing account deletion browser flow covers cancellation, scheduling,
  sign-out, grace-period display, and cancellation; the backend test processes
  a due request and checks session revocation and anonymization. There are no
  team members or external integrations to remove in this release. Repeated
  scheduling now returns the existing scheduled request without moving its
  deadline or creating another security event/email. The settings UI also
  guards synchronous duplicate schedule/cancel clicks. Focused backend
  schedule/cancel tests passed **2/2**.
- Found that play-progress Reset immediately cleared all marks without
  confirmation and could enqueue a second reset before the first completed.
  It now confirms the irreversible action, disables the empty/pending button,
  and uses an in-flight guard. The server treats repeated DELETE requests on
  already reset progress as a no-op without incrementing its version or
  changing `reset_at`. Focused player component tests passed **6/6** and the
  backend progress API test passed **1/1**. The live guest and signed-in reset
  journeys passed **2/2**, including cancellation, offline failure recovery,
  accepted reset, and reload.
- A browser created and published a fresh bingo, cancelled its Delete dialog,
  then confirmed deletion. The board disappeared from Created, Back did not
  show its old title, and the direct deleted URL returned HTTP 404 (**1/1 live
  Chromium**). The confirmation now explains lost profile/link access and
  irreversibility. An owner API test passed: unauthorized deletion remained
  forbidden, the first owner DELETE returned 204, and a repeated DELETE
  returned 404 without changing the deletion timestamp. The UI adds a
  synchronous in-flight guard to prevent duplicate board management requests.
- The product has no user-facing recovery for deleted creator-owned bingos;
  that conditional Undo/recovery item remains open. The loading section is
  partial: route/form status, editor save/upload stages, export polling and
  completion were exercised earlier; not every control has a complete
  duplicate-submit or layout-stability observation, and large uploads have
  stages without a measured byte percentage. No skeleton UI is used.

### 2026-09-30 — Interface states and editor controls (sections 4, 8, partial)

- Prior live and static browser flows exercised first load, populated and
  empty feeds, missing search/comments/notifications, API errors, offline
  editor recovery with Retry, protected routes, and session expiry. These
  establish representative states but not every component's partial-data
  behavior, so the UI-state section stays partial.
- Source inventory found native buttons for actions and links for navigation;
  no clickable `<div>` or role-button stand-ins appeared in the reviewed app
  components. Common buttons have a visible focus ring, disabled styling, and
  pointer feedback; destructive controls use the danger treatment and the
  Reset/Delete confirmations were exercised above.
- Found the editor's history (36px), size (42px), formatting (37×35px), colour
  (34px), and conflict-resolution (38px) controls below a 44px touch target.
  Raised those targets to at least 44px. A live Chromium author opened the
  cell inspector, left inline typing with Escape, then measured all 11
  history/size/format/colour controls at both 320px and 1710px widths. Every
  measured target was at least 44×44px, with no document horizontal overflow
  (**1/1**). The first attempt measured zero-width hidden inspector controls
  while inline typing on mobile; the final scenario explicitly enters the
  visible inspector before measuring.

### 2026-09-30 — Error tracking, monitoring, and alerts (sections 63, 65, 66, partial)

- Django initializes `sentry-sdk` only when `SENTRY_DSN` is set, with
  `APP_ENVIRONMENT`, `APP_RELEASE`, and `send_default_pii=False`. Those values
  are available to the backend, worker, and Beat through Compose. No
  production DSN or real captured event was supplied. The frontend has no
  error-monitoring integration, so client exceptions and unhandled promises
  are not yet confirmed in an external tracker. Browser source maps stay
  private and are blocked from public image directories; there is no private
  provider upload. Structured server logs include request ID, route, status,
  duration, environment, and release, but logs alone do not prove alerting.
- QA probes returned HTTP 200 for the proxy/frontend health route, API
  readiness (database, migrations, cache), and recent Beat heartbeat. Compose
  also defines frontend/backend/worker/proxy/dependency healthchecks. This is
  local endpoint evidence, not external uptime monitoring. No production
  infrastructure exists to inspect DB/Redis storage capacity, queue depth,
  error rate, or latency from an operator dashboard.
- The runbook specifies actionable pages for availability, sustained 5xx,
  database capacity, delayed critical work, backup failure, and security
  anomalies. No monitor destination, escalation recipient, thresholds, or
  delivered alert can be verified without a target platform. The product has
  no payments or payment webhooks; email delivery and object storage do exist
  and require dependency failure alerts before launch.

### 2026-09-30 — GitGuardian PR finding (section 41)

- GitGuardian incident **37737208** on PR #18 points to commit `36cf4f2`,
  `backend/tests/test_accounts.py`, in
  `test_registration_rejects_weak_or_username_similar_passwords`. The three
  string inputs are deliberately weak password examples passed to the
  registration endpoint; the test asserts rejection and does not create a
  user. Its email uses a `.test` domain. The two distinctive
  examples occur only in that tracked test file, not runtime configuration or
  provider credentials. No secret value is copied into this evidence log.
  The external GitGuardian incident still displays `Triggered`; its owner
  should classify this test fixture as a false positive in GitGuardian so
  the PR warning is not mistaken for an active credential leak.

### 2026-09-30 — Keyboard uploads, local errors, and profile edits (sections 7, 23–24, 56)

- All four native image choosers (cell, board background, cover, avatar) were
  hidden from keyboard navigation. Replaced `hidden`/`display:none` with a
  visually hidden focusable input and a visible parent focus ring. Chromium
  exercised Tab/Enter/file chooser at **320 and 1710 px**, without overflow.
- Account settings now place action feedback in its own card, protect all
  actions with one synchronous in-flight guard, and focus a labeled, described
  confirmation-password error. Component tests cover mismatch, a failed
  password change with preserved input, and successful retry. Profile edits
  warn on link navigation and full unload; saving normalized values clears the
  warning. Live navigation cancel/save/retry passed. SPA browser Back behavior
  is not claimed by that warning evidence.
- Live avatar upload, reload, removal and second reload persisted the correct
  asset/null state. The password-recovery journey additionally changed the
  password through Account Settings, preserved the current session, logged
  out, and logged in with the new credential. Backend tests verify revocation
  of other sessions. Earlier Mailpit email change/reverification, name/bio and
  language/privacy/notification preferences, current-session logout, deletion
  confirmation/cancel and worker anonymization cover the remaining settings.
  A separate logout-all button and a saved user timezone are absent; dates use
  the browser timezone and other sessions can be revoked individually.
- Reordered editor DOM so its H1 precedes the inspector H2 while preserving
  the desktop grid with CSS. The live accessibility helper now checks one H1,
  the first heading, and heading-level progression alongside full-severity Axe
  for language, editor, play, settings and the report dialog.

### 2026-09-30 — Initial state races and reversible archive (sections 5, 9, 43, 101)

- A mobile first click could be overwritten by late progress hydration.
  Cells, Reset, Share and mark selection now wait for progress readiness.
  A later two-tab like probe exposed the same race in social state: only one
  POST was sent while the other button changed under the click. Like, Follow,
  Archive/Delete now wait for initial state; the optional author fetch finishes
  before actions become ready. The regression asserts disabled/enabled state,
  and concurrent live likes explicitly wait for both views to be ready.
  The full repeat proves two requests, statuses 200/201 and one stored like.
- An author archived the fixture board, observed its read-only state and a
  guest 404, reloaded, restored it and observed guest 200; restore persisted
  across reload. Account deletion already has a tested fourteen-day cancel
  period. Permanent Delete and progress Reset explicitly describe irreversible
  effects and require confirmation; no undo is promised for those actions.
  This closes section 9's conditional recovery requirement.

### 2026-09-30 — Safe application, worker, server and error-provider logs (sections 55, 63–64)

- The JSON formatter projects approved event/context fields. It drops arbitrary
  library messages and arguments, request bodies/headers, exception messages,
  source lines and locals. Exceptions retain type and at most 32 basename/
  function/line frames. Request paths use resolved templates, with `/unmatched`
  for unknown routes. Tests inject synthetic sensitive text into vendor logs,
  arguments, exceptions and unmatched paths and prove it is omitted.
- Celery applies this logging configuration and emits safe task start/completion/
  retry/failure records. Gunicorn loads `python:config.gunicorn` in the production
  Docker command; its master/worker and access loggers use the same formatter,
  and ordinary raw access records are suppressed. The installed Gunicorn logger
  subprocess test verifies redaction. A real temporary Gunicorn process on the
  isolated backend returned 200 for the query-marked health probe and emitted
  only the query-free correlated application record. It was stopped afterward.
- Sentry's event/transaction hooks retain grouping locations and timing while
  dropping request/user fields, free-text messages, breadcrumbs, SQL/URL span
  descriptions, task values and locals. **3/3** focused tests include delivery
  through the installed SDK to an in-memory transport with synthetic markers.
  This proves local filtering, not a production DSN, frontend integration,
  private source-map upload or an externally delivered alert; section 63 stays
  partial. Context7's Gunicorn query was unavailable; configuration was checked
  against the official settings documentation and the installed 23.0.0 runtime.
- The repository logging requirements are verified before deployment. CDN,
  ingress and provider-specific telemetry must follow the same query/body
  exclusion contract and remain separate rollout/privacy gates.

### 2026-09-30 — Proxy outage recovery and recovery-link privacy (sections 6, 31–32, 50, 55, 64)

- Nginx's default upstream error text included full request URLs, even though
  access logs excluded queries. Request-level error text and raw user-agent
  access fields are now suppressed; original query-free path, upstream status,
  HTTP status, timing and request ID remain in JSON. Startup/configuration
  diagnostics remain enabled.
- Stopped the isolated frontend and requested marked Reset Password and Explore
  query URLs. Responses were 504 (about five seconds), with the independent
  branded recovery HTML, `Cache-Control: no-store` and `no-referrer`. Marker
  values did not appear in proxy logs; the original paths did. Recovery actions
  and layout were checked at 320/1710 px and the 320 px screenshot was inspected.
  Restart restored service. The repeatable `verify-proxy-recovery.sh` passed and
  is wired into full-stack CI; it requires an explicitly isolated local E2E
  stack and restarts only its existing frontend container.
- Used verification/reset/email-change tokens are removed from the current
  browser URL; the original link is reopened to verify one-time rejection.
  Those pages use `no-referrer`. An initial blanket no-referrer policy broke
  Django Admin POST origin verification; it was caught and corrected to use
  `strict-origin-when-cross-origin` on other pages. Admin moderation and email/
  reset/reuse journeys passed in the final live suite. Existing historical
  links and the target edge's log policy still require rollout attention.

### 2026-09-30 — Scheduled overlap, abandoned claims and broker restart (sections 42, 68–69)

- Scheduled maintenance uses PostgreSQL session advisory locks, released in
  `finally`; concurrent deliveries skip work and bounded database/storage
  retries use backoff and jitter. An independent PostgreSQL connection held
  a real lock while the task skipped; failure released it and the next run
  proceeded. Workers require direct/session-pooled PostgreSQL, which is now an
  explicit deployment contract; transaction pooling is incompatible.
- Every five minutes, the bounded recovery sweep locks/rechecks old export and
  upload claims after the hard time limit plus 60 seconds. A second sweep does
  not enqueue duplicates or affect recent claims. Persistent attempts stop
  repeated crashes at five; terminal failed/rejected state and structured
  failure records are observable. Storage exhaustion no longer leaves exports
  queued forever, and expired exports cannot restart processing. API errors
  map internal codes to actionable text, and polling exits on expiry/failure.
- Applied the additive media attempt-count migration to QA. Real Redis/worker
  rehearsal stopped worker/Beat, queued the heartbeat task
  `0b5e4667-21af-4eb8-a0ca-553b9d536e64`, restarted Redis and workers, then observed
  start and SUCCESS for the retained task. All services were restored. This is
  local AOF/queue recovery evidence; the chosen broker, worker platform,
  scheduler singleton and alert delivery remain unverified.

### 2026-09-30 — Categorical product activity and cohort report (sections 55, 61–62)

- Page views and Create/Register/Login navigation now use allowlisted surface/
  action categories without URLs, IDs, names, query strings or form values.
  Recovery routes do not generate these events. Server validation, ingestion
  retry idempotency, strict-mode duplicate prevention and cancelled navigation
  are covered. The live browser proved accepted page/CTA events with marked URL
  values absent. The first CTA implementation incorrectly ignored Next Link's
  normal `preventDefault`; live evidence exposed it and the regression now
  covers framework navigation.
- `product_metrics --days 30` produces read-only aggregate JSON with environment/
  UTC window, separate guest-browser and signed-in estimates, server signup/
  login counts, and a mature signup cohort. Activation is play start/publication
  within seven days; return is an activated account visit on days 8–14. The
  fixture proves 3 mature registrations, 2 activations and 1 return, excluding
  immature/staff accounts; the report uses at most five queries and emits no
  user data. It does not claim an exact visitor-to-signup conversion or recover
  blocked analytics, deleted accounts or pre-instrumentation visits. Separate
  production/staging databases, actual early-user observations and legal
  consent decisions still require deployment/operator inputs.
- The choice-only analytics migration and regenerated OpenAPI/client types
  preserve old event compatibility. `spectacular --validate --fail-on-warn`
  passes after naming both analytics and moderation action enums explicitly.

### 2026-09-30 — PWA and remaining debug-feature inventory (sections 60, 84–85)

- Runtime source inventory found no service-worker registration, worker file,
  web manifest, PWA install flow, fake-auth switch, hidden seed control, payment
  bypass, unfinished feature CTA, debug shortcut, `console.log`, `alert`,
  `debugger`, TODO or FIXME in production app modules. The remaining local
  address/example email defaults are in development configuration or guarded
  origin helpers; production validators reject them. Legal/support identity
  remains a mandatory operator input, not a placeholder feature promise.
- A fresh live Chromium context at Discover returned 200, with **zero service
  worker registrations and zero CacheStorage entries**. PWA-specific bullets
  are N/A. No previously deployed origin exists to have a historical worker;
  version/CDN changes remain assessed separately in section 59.
- Agentation is development-only, staff actions are permission-checked,
  production debug/fake seed mode is rejected, and the inspected production
  build contains no Agentation bundle. This completes the predeployment
  feature/debug inventory without claiming target hosting configuration.

### 2026-09-30 — Final local regression for this batch (sections 70, 73, 105)

- PostgreSQL suite: **166 passed, 1 infrastructure-location skip**. Ruff lint,
  formatting (163 files), mypy (74 source files), migration drift and validated
  OpenAPI passed. Test settings now force local in-memory storage instead of
  inheriting the QA S3 setting.
- Frontend: ESLint, TypeScript, Prettier and **117 tests in 26 files** passed.
  Current Next production build completed, including dynamic SSR and static
  icon/social assets. The required full live run passed **51/51** across
  Chromium, mobile WebKit, Firefox, desktop WebKit and Android emulation.
- Earlier failed runs are not counted as passes: the blanket referrer regression,
  first-mark hydration race, wrong guest Create assertion, CTA tracking issue,
  and two-tab hydration race were investigated and corrected. The final run
  above includes those affected journeys. New backend pytest and live fixture
  seeding are run sequentially against the isolated environment.
- The exact final commit still needs its CI release gate. Production-provider,
  real device, full form/autofill/dirty-navigation, remaining itemized API/data
  and deployment evidence are not implied by this local pass.


### 2026-09-30 — Multilingual export defect and actual downloads (sections 26, 29, 35, 69, 79)

- Found a real worker defect: its Pillow fallback font could not cover all
  supported content languages, text was silently limited to six lines, and
  Helvetica PDF titles could replace non-Latin characters. Replaced text
  layout with installed Pango/Cairo and Noto core/CJK/color-emoji families in
  both development and production images. Escaped user text is passed in a
  private temporary file with no shell, a UTF-8 locale, finite subprocess
  deadline and safe errors. Native shaping handles Arabic/Devanagari, bidi,
  combining glyphs and fallback; measured text shrinks to fit without dropping
  lines. PDF titles wrap and use the same renderer.
- The installed native layout regression covers every one of the 15 supported
  languages, literal markup/ampersand, mixed scripts, emoji, formatting and
  explicit text after line six. Serialized native output reported **zero
  unknown glyphs and zero ellipsized layouts**. Timeout diagnostics cannot
  expose user text. A missing required image now fails/retries instead of
  delivering an apparently successful export with a blank cell.
- Rebuilt backend/worker/Beat and restarted only the isolated services. In
  installed Chrome, created and published a multilingual board through the
  authenticated API, opened its editor and downloaded Published PNG and PDF
  using the real queue and protected file route. Downloads completed in
  **2.4 s and 1.2 s** without browser errors. PNG and a Poppler rasterization of
  the single A4 PDF were visually inspected: title, all scripts, colored emoji,
  literal markup and final END line were visible without clipping/overlap.
  Artifacts are private, ignored `tmp/pdfs` verification output.
- A production image ran the native renderer as UID **10001**, with visible
  mixed-script text. A separate bounded probe rendered **100 unique 100-character
  multilingual cells in 6.74 s**, all within a 152-pixel text box. This is local
  timing, not a target concurrency/SLA claim. Python-only CI explicitly installs
  the native font/runtime packages; container vulnerability/SBOM gates still
  apply. Export PDFs remain a raster board, as before, and are not claimed to
  be tagged/searchable accessible documents.

### 2026-09-30 — Loaded production routes, safe gateway errors and data/storage audit (sections 6, 43, 58, 70, 75, 79–80)

- Installed Chrome inspected the actual optimized production candidate on
  `localhost:18081`: **16 public routes at both 320 and 1710 px**, plus three
  authenticated routes. Waited for loading/busy states to finish and asserted
  no page-level error states; all routes returned 200, with zero script/console
  errors or warnings, failed static assets or horizontal overflow. Loaded
  Discover screenshots were visually reviewed at both widths. Seven private
  environment/Git/backup/SQLite/key/log/internal-server HTTP probes returned
  404. These are configured staging-origin checks, not public-domain evidence.
- Safe API presentation now covers non-JSON gateway 400/401/403/404/409/413/422/
  429/500/503, without reading raw HTML; broken JSON, finite read/write timeout,
  caller cancellation, disconnect and expired-session behavior are also
  covered. A real 17 MiB Content-Length probe returned **413** from Nginx before
  accepting a body. Form/draft/progress preservation and appropriate retry
  were exercised in the live outage/conflict flows; technical failure details
  use private projected logs/SDK events. 422 is defensive compatibility;
  this API uses 400 for its own field validation.
- Data-integrity evidence maps every applicable original bullet to
  `test_social.py` (real concurrent duplicate likes/follows, exact counters),
  `test_api_boundaries.py` (repeated publication/export/report/progress/delete),
  draft/revision version tests and the live two-tab conflict/like journeys,
  `test_notifications.py` (deduplication), and security/job tests for retained
  reply threads, referenced-media protection and duplicate/abandoned claims.
  No webhook feature exists. This closes section 43's repository checks.
- Browser-storage evidence maps to guest progress, progress recovery and
  editor-recovery tests: schema/revision/owner mismatch, corrupt JSON/numeric
  data, unavailable storage, legacy recovery and safe clear. The real live
  two-tab logout revoked private server state and cleared both recovery
  versions/session progress, then logged in as another account. Non-persistent
  browser contexts exercised isolated storage; signed-in recovery cannot cross
  account IDs. No password, cookie or auth token is stored in local/session
  storage. This closes section 58's relevant bullets.
- The reproducible proxy fault script now verifies recovery as well as the
  outage: after two forced gateway failures and query-marker redaction, the
  same frontend container restarts and `/discover` returns a successful page.
  The final script passed; it preserves the existing container environment
  and restores the service on failure.
- Latest local checks: **168 PostgreSQL tests passed, one infrastructure-location
  skip**; subsequent changed export/metrics tests are recorded separately until
  the final full gate. **126 frontend tests in 26 files**, ESLint, TypeScript and
  Prettier passed. The expanded full live suite passed **52/52** across all five
  configured desktop/mobile browser projects, including real PNG/PDF downloads.
  The aggregate metrics regression now excludes anonymized/deleted accounts
  explicitly, in addition to immature/staff cohorts.
- Sections 6, 43 and 58 are now checked with the above itemized evidence. Full
  forms/autofill/password-manager/Back behavior, actual native 200% zoom, real
  devices, unreviewed original bullets, operator/legal inputs and the target
  deployment remain open. Final source head still requires CI; no local result
  is described as complete production readiness.


### 2026-09-30 — Current source regression after the export-image safeguard

- Full backend gate after all changes: Ruff lint, 163-file formatting, 74-source
  mypy, migration drift and **169 passed / one infrastructure-location skip**.
  The changed export/metrics subset passed **8/8** before this full run.
- Current optimized Next build completed after the gateway-message change.
  Frontend remains **126/126**, full live suite **52/52**, and the final proxy
  restart check passes. Native runtime/font packages are installed in both
  Docker targets and in the Python-only CI test runner.


### 2026-09-30 — CI language-race fix, submission guards and profile navigation (sections 3, 5, 7, 17, 43, 46)

- CI run 36715579877 for source **07c4d6b** passed foundation, secret scan,
  backend, frontend, static browser and both production-image jobs. The live
  suite failed one language-filter assertion (only Russian reached the URL),
  so the release gate failed. This failure is not recorded as a passing release.
- Reproduced the underlying problem on the optimized build by holding Next
  JavaScript requests: the SSR English checkbox was enabled, accepted a check,
  then reset after React initialized. Explore now renders a disabled semantic
  fieldset until its handlers are ready; Discover language choices have the
  same guard. The live regression holds scripts, verifies disabled controls,
  releases them and checks both languages, URL restoration and 320/1710 px
  layout. No retries/timeouts were increased to hide the failure.
- Registration, login, password reset request/confirmation and verification
  resend use immediate in-flight guards. Five frontend regressions submit
  twice in the same event batch, verify one pending request, preserve fields
  on failure and permit a retry. Inputs have stable names and password-manager
  autocomplete semantics; that is not a claim that a real manager was tested.
  Registration with a padded username passed the real Mailpit verification
  and login flow after blur normalization; email/username payloads trim spaces.
- Editor Save/Publish/Export also share an immediate action guard. Retrying an
  unchanged publication after a lost response reuses its idempotency key. A
  regression checks one pending publication and the same key on retry.
- Profile edits now remain in a small account-keyed memory cache across SPA
  Back/Forward; no password/email/account-secret fields enter it. Reload/closing
  and ordinary link navigation retain the existing dirty-form warning. Explicit
  logout, current-session revocation and account deletion clear the cache.
  Avatar updates preserve fields being edited. The live test checks Back,
  Forward, restored content, cancelled navigation, successful save and removal
  of the warning. Account-deletion regression checks account isolation and
  cache clearing. This does not close every other product form's dirty-state
  review.
- Notification evidence maps creation/dedupe/preferences/self-suppression and
  user-scoped unread/read to `test_notifications.py`, all social activity
  types to `test_api_boundaries.py`, and UI timestamps/link/Mark All Read/reload
  to the live author-notification journey plus date-format tests. New real
  publication/reply API cases make the board deleted or private: generic
  notifications remain readable, expose neither title/cell/reply content, and
  board/comments return 404. Repeated Read preserves `read_at`; unread filter
  and count reach zero and repeated Mark All Read updates zero rows. Mark
  Unread is not a feature of this release. Section 46's applicable bullets are
  now checked.
- Local final gates: Ruff lint/163-file formatting, mypy/74 sources, migration
  drift, **171 PostgreSQL tests passed / one infrastructure-location skip**;
  ESLint/TypeScript/Prettier and **132 frontend tests in 27 files**; optimized
  Next build; full live **52/52** across all five browser projects. Installed
  Chrome on the production build checked 16 public routes at 320 and 1710 px,
  three signed-in routes and seven private-file probes, with zero script or
  console errors/warnings, failed assets or horizontal overflow.
- Native password managers/autofill, actual browser zoom/devices, remaining
  unreviewed original bullets, operator/legal inputs and real target services
  remain open. The follow-up source still requires CI. Neither these local
  results nor the tracker count claim completed production readiness.


### 2026-09-30 — Rate quotas and safe malformed-input feedback (sections 6, 52–53, 82)

- Added real API regressions for nine sensitive paths: login, signup,
  verification, verification resend, password-reset request/confirmation,
  email-change request/confirmation and upload intent. A one-request test quota
  accepts validation of the first invalid payload (400), then returns 429 on
  the second request before further work. Existing tests cover login brute
  force, reset-link confirmation independent of the request quota, and
  idempotent share/export retries with no extra records/counters.
- Eight public-read cases check guest/signed-in catalog search, feed, tags and
  author suggestions with changed query or endpoint. Author suggestions
  intentionally ignore sessions and use their per-IP anonymous quota for all
  callers; this is reflected in the regression rather than changing their
  privacy projection. Forged leading forwarded-IP protection was already
  exercised in the security regressions and rendered proxy configuration.
- Standard 429 responses now retain Retry-After and expose a plain message
  with the delay plus numeric `retry_after_seconds`; framework throttle prose
  no longer becomes a field error. The tests verify code, message, header and
  details. This closes every applicable section 53 bullet; AI endpoints are
  absent. Real edge/provider policies and capacity tuning remain rollout
  concerns, separate from repository quota protection.
- Malformed request JSON now returns a generic safe 400/parse_error envelope,
  without parser diagnostics or the marked request body. Verified in the API
  regression and with actual raw bytes through QA Nginx. The first native probe
  sent a JSON string through Playwright's serializer and correctly received
  a field-validation error; resending raw bytes exercised the intended parser
  case. No successful parser check is inferred from that initial probe.
- Two frontend client regressions consume the exact new rate/parser envelopes
  and show the safe message without field prefixes or diagnostics. Full
  backend gate passed **189 tests / one infrastructure-location skip**,
  including Ruff/format/mypy/migration drift. Frontend ESLint/TypeScript/
  Prettier and **134/134** tests passed. The full 52-scenario live gate passed
  before this API-message change; no user journey code changed afterward.
- The copied checklist/hash validator and final diff check pass. Follow-up
  source needs its own CI gate; native manager/device/zoom checks, unreviewed
  product/API bullets and real deployment gates still remain.


### 2026-09-30 — Real literal-content abuse journey and repaired CI (sections 52, 72)

- CI run **36720920271**, source **b4643312ed23eb7cd88c8a83f0e3704ad6d51fce**,
  passed all **nine jobs**, including full-stack flows, both production images
  and Release gate. This confirms the language-race/submission/profile batch.
  The subsequent API-feedback changes still need their own source gate.
- A new live Chromium regression creates and publishes a board containing
  literal HTML, a script tag, an image onerror handler, a JavaScript URL and
  SQL-looking text. Public SSR/client rendering displays the exact text,
  produces no script/image/link descendants, and never sets the attack marker.
  A literal title search containing quotes/SQL-looking syntax returns exactly
  that board. Signed-in login with an external return URL resolves to Discover.
- The same real-API journey rejects negative, decimal and huge board sizes and
  an unknown content-language enum with 400; a negative board identifier returns
  404. An upload intent using a path-traversal/HTML filename receives a server
  storage key containing none of those values, then is deleted as cleanup.
  The targeted journey passed. Its initial assertion incorrectly expected
  publication 200; source and checked-in OpenAPI specify 201, so the regression
  was corrected to that existing contract. No application status was changed.
- The other section 52 requirements map to the previously observed 17 MiB/413
  proxy limit, new scoped repeated-request and existing brute-login tests, real
  malformed-byte 400 check, and cross-owner UUID/staff-spoof tests in
  `test_api_boundaries.py`. All original relevant inputs have concrete evidence;
  this bounded local audit is not a penetration-test guarantee.

- The expanded complete live regression subsequently passed **53/53** on all
  five configured browser projects after the rate/parser-message change.
- Navigation section 3 now maps to the real branded-home/header/footer route
  walk, current-route ARIA, profile Back/Forward recovery, direct/reloaded/new
  tab board/profile/Explore/share cases, combined-filter query restoration and
  sections 93–96's observed sticky-anchor/dialog/disclosure behavior. There is
  no collapsible mobile navigation menu in this release, so its closing bullet
  is N/A; navigation remains visible at narrow widths. No copied URL relies on
  a previously opened parent route for its documented state.
- Profile Save/Language/Privacy feedback now sits beside the corresponding
  control. A held real profile PATCH at 320 px confirms disabled inputs and
  button, a visible Saving state, then successful completion; four focused live
  scenarios passed after this UI edit. ESLint, TypeScript, Prettier, 134 frontend
  tests and the optimized build passed again. A production Next start then
  checked 16 public routes at both 320 and 1710 px, three signed-in routes and
  seven private-file probes: zero console errors or warnings, failed assets,
  overflow or exposed private files. The exact new source CI gate is still
  required.

### 2026-09-30 — Basic launch item mapping (sections 1–2)

- The working checklist now marks the locally observed section 1 items
  individually. Favicon/title/description and Open Graph evidence comes from
  the icon, metadata, 1200×630 image and production HTML checks above. Logo,
  routes, Back/Forward and mobile/deep-link behavior come from the navigation
  and 16-route browser walks. Unknown and deleted pages returned real 404;
  the branded gateway outage and application error/retry paths cover server
  failures. Loading, empty, success, failure and duplicate-action guards are
  exercised in the editor, account, catalog and profile journeys.
- The production build with a configured HTTPS origin used that origin for
  canonical and social assets. Production-mode metadata omitted staging
  noindex, while staging mode included it. Seed E2E refuses production settings;
  the source/content scan found no intentional demo/debug control or console
  logging. Reset email rendering uses the configured HTTPS frontend origin;
  real Mailpit delivery and token use passed. Session revocation, cross-tab
  logout, account switching and a native Safari guest play/share journey were
  observed locally. These checks do not assert what the eventual public
  hosting provider will actually serve.
- A phone-size and desktop visual review of Discover found two distinct
  actions, with Find a bingo primary, and a direct explanation of playing and
  sharing. The intro now states that guest play is free and creating a board
  requires signup. At 320×667 the earlier ordering placed the primary CTA at
  y=649–693, clipped by the viewport. Moving the intro ahead of the language
  filter put Find a bingo at y=545–589 and Create your own at y=601–645;
  neither overflows. The focused real-browser public-route journey passed on
  the optimized build, including guest Create navigation and 320/1710 px route
  checks. Section 2 is now checked as a manual browser/heuristic review, not
  as a claim of external user-comprehension research.
- CI run 36725451055 for source 37832bd passed backend, frontend, browser
  smoke, both production images and the full-stack product flows. Its secret
  scan and aggregate release gate failed: the generic-api-key heuristic
  matched ordinary words in one historical checklist summary about generated
  storage locations and invalid size values. The reported line contains no
  credential. That sentence was rewritten, and an exact historical finding
  fingerprint was added to `.gitleaksignore`, without widening the rule or
  suppressing future findings. The same Gitleaks v8.30.1 Docker history scan
  then passed locally over 59 commits. Exact-source CI still needs to pass.

### 2026-09-30 — Locked Python dependency graph (sections 70–72)

- Source `a448963` passed foundation, backend, frontend, secret scan, both
  production images and full-stack flows in CI. Its Browser smoke job was
  cancelled, so the aggregate Release gate failed; the source has no complete
  nine-job pass. The next committed source must pass that gate.
- The frontend already commits `package-lock.json` and installs with `npm ci`.
  The backend previously pinned only direct versions in `pyproject.toml`; its
  production image and CI could resolve newer transitive packages on each
  build. Generated universal Python 3.13 production and development locks
  with 58 and 78 pinned packages respectively; all 58 production pins agree
  in the development lock. The Docker builder installs the production lock,
  installs the local package without resolving dependencies again, runs
  `pip check`, and removes wheel-build artifacts. CI installs the development
  lock, runs `pip check`, and audits the production lock. README documents
  regeneration.
- The production and development backend images built from the new files on
  local ARM64. Importing Django, Pillow, psycopg, boto3 and ReportLab in the
  production image returned their expected pinned versions. The development
  image passed `pip check`, Ruff lint and format for 163 files, and mypy for
  74 sources. Its initial lint pass found a generated `build/lib` copy of the
  source; removing the build directory from the builder fixed that image-only
  duplication. A local audit of the locked production graph found no known
  vulnerabilities. The new lock/image combination still needs exact-source
  x86_64 CI and full tests before section 71 closes.

### 2026-09-30 — Same-origin API build contract (section 1)

- The client already defaults to `/api/v1`, and the production frontend image
  routes it to its backend service. Its build/runtime validation now requires
  exactly that same-origin public path and an explicit absolute, non-local
  server `/api/v1` URL. Production mode also rejects test, preview and staging
  hostnames for both the public origin and backend address. This prevents a
  production image from embedding an external staging API URL in the browser or
  silently falling back to localhost when the server URL is omitted. A valid
  internal backend and nine invalid/missing
  destinations, including IPv6 loopback and staging hosts, passed ten focused
  validator subprocess checks. The real target service routing still requires
  rollout smoke on the selected platform. The complete frontend gate after this
  change passed ESLint, TypeScript, Prettier and **144 tests across 28 files**.
  CI run 36746583513 at source `f0588c4` built the frontend production image
  with this validator and passed all nine jobs, including the release gate.

### 2026-09-30 — x86_64 dependency proof and mobile WebKit click correction (sections 71, 93)

- CI run 36740984070 at source `4557c6a` built both production images on
  Ubuntu x86_64. The full-stack job then completed a multilingual PNG/PDF
  download through the real worker, proving the locked native rendering packages
  load and function on that architecture. Backend/frontend quality, secret scan,
  browser smoke and both image builds passed; the full-stack job failed one of
  53 scenarios, so the aggregate release gate remained red. This closes only
  the architecture-specific dependency item, not the release gate.
- The failed scenario was the mobile WebKit Discover language checkbox. Its
  Playwright trace shows document scroll position changing from 388 to 412
  during the click while global `scroll-behavior: smooth` was active. This is
  consistent with the click missing the moving input after the stability check.
  Removed global smooth scrolling and the matching Next HTML declaration. The live QA
  browser now computes `scroll-behavior: auto`; the language/mark touch scenario
  passed 20 consecutive mobile WebKit runs. The complete live QA run then
  passed all 53 scenarios across Chromium, mobile WebKit, Firefox, desktop
  WebKit and Android Chromium in 3.5 minutes. CI run 36746583513 at source
  `f0588c4` passed all 53 full-stack flows and the aggregate release gate.

### 2026-09-30 — Protected API status contract (section 77)

- Before correction, live QA returned HTTP 403 for an anonymous GET to
  `/api/v1/auth/me/`. Django REST Framework was replacing its 401 response
  because session authentication did not advertise a challenge. The session
  authenticator now sends `WWW-Authenticate: Session realm="api"`, so protected
  guest GET and CSRF-valid write requests return 401. Authenticated permission
  failures and invalid CSRF remain 403. The frontend continues to recognize
  both 401 and 403 missing-session responses for compatibility with an older
  API during rollout; two status-specific unit cases cover each path.
- QA HTTP probes saw direct `/discover` and health routes return 200, an
  unknown route return 404, guest `/auth/me/` and progress return 401, and
  `/discover/` return 308 while preserving language/page query parameters.
  The intentional root 307 resolves to canonical `/discover` with final 200;
  it is not advertised as a permanent move. Backend authorization tests retain
  403 for an authenticated forbidden mutation. The full backend test suite
  passed **189 tests with one environment-dependent skip**, Ruff and mypy
  passed, and the frontend gate passed **146 tests**, ESLint, TypeScript and
  Prettier. The refreshed live QA suite passed **53/53** scenarios after
  updating exact status assertions, including protected-action session expiry,
  logout in another tab and password reset. This is local QA evidence; real
  domain/edge status responses still require rollout verification.

- CI run 36749227481 at source `3d3c7cc` passed all nine jobs, including the
  401/403 API regression, full-stack product flows and the release gate.

### 2026-09-30 — Inline form recovery and control feedback (sections 7, 8)

- The registration serializer now places weak-password validation under the
  `password` field instead of a form-wide error. Registration and reset forms
  display structured API field errors next to the matching input, expose them
  with `aria-invalid`/`aria-describedby`, preserve entered values, and focus
  the first affected field. The client still shows a general action error for
  rate limits, outages and invalid links. Browser autocomplete, names and
  spellcheck behavior were made explicit on auth, profile, search, language,
  comment and report controls.
- On live QA, a taken username returned 400 and focused the invalid username
  with nearby text. A weak registration password and weak reset password each
  returned 400 and focused their respective password input with a nearby
  alert. The registration check ran at 390 px with no horizontal overflow.
  Repeated manual probes triggered the configured five-per-hour registration
  throttle and showed HTTP 429; only that throttle key was reset in the
  isolated QA Redis before the final weak-password probe and full test run.
- A DOM inventory of Login, Register, Forgot/Reset Password, Explore, Profile
  and signed-in root Comment forms found labels for all visible controls. It
  identified one profile-bio autocomplete omission, which was corrected.
  Native password-manager/autofill behavior and the remaining form sweep are
  still open. Shared primary/secondary/text/icon buttons gained a pressed
  position, and a 390 px Chromium probe observed base/hover/active changes
  with no horizontal overflow.
- The complete backend gate passed 189 tests with one environment-dependent
  skip, Ruff and mypy passed, and the frontend gate passed ESLint, TypeScript,
  Prettier and 148 tests. The complete live QA suite passed 53/53 scenarios
  across Chromium, mobile WebKit, Firefox, desktop WebKit and Android Chromium.
- CI run 36752834409 at source `dd621d7` passed all nine jobs, including the
  form changes, browser smoke, 53 full-stack scenarios, production images and
  the release gate.

### 2026-09-30 — Direct Explore tags and bounded catalog queries (sections 4, 17, 82)

- A live QA request with two repeated tag parameters (`e2e`, `public`) returned
  two public boards, while the comma-joined query sent by Explore server
  rendering returned zero. This made a direct multi-tag Explore URL or reload
  show a false empty result. Server rendering now splits and repeats the tag
  parameter as the browser API client already does. The live Chromium journey
  opens and reloads that direct URL and sees the expected board (1/1 passed).
- The public catalog now rejects more than 15 tag filters and tag values over
  50 characters, matching the published-board limits and bounding query joins.
  An isolated PostgreSQL API regression passed for both cases. Interactive
  Explore shows either limit error beside the tag input and focuses it without
  replacing valid results. An invalid direct URL shows an error and no stale
  cards. The browser journey passed both cases. The tag input's accessible
  name and separate limit hint were also confirmed through that journey.
- The final frontend quality gate passed ESLint, TypeScript, Prettier and 148
  tests. Ruff and mypy passed for the touched backend files; the exact-source
  CI gate remains pending.

### 2026-09-30 — Catalog ownership and sort contract (section 82)

- The catalog previously treated guest `mine=true` as an ordinary public list
  and ignored invalid `mine` or `ordering` values. It now returns 401 for a
  guest requesting their own boards and 400 for malformed filters. An author
  receives their own public, unlisted and private boards under `mine=true`.
- Two isolated PostgreSQL API cases passed, as did Ruff and mypy on the touched
  backend files. Live QA HTTP probes observed 401 for guest `mine=true` and
  400 for an unknown ordering. The full API endpoint matrix is still open.
- Notifications accepted an arbitrary `unread` value by silently returning
  every notification. The list now returns 400 for invalid values, and its
  OpenAPI/TypeScript contract documents the real unread filter instead of
  inherited search/sort options that the list did not deliberately support.
  Two privacy-preserving notification API variants passed on PostgreSQL; Ruff,
  mypy, schema validation and frontend typecheck passed for this adjustment.

### 2026-09-30 — Editor field recovery and slider names (sections 7, 24)

- A signed-in browser accessibility-tree walk of `/create` found that the cell
  inspector's Background opacity, Image opacity and Border width range inputs
  were announced as unnamed sliders. Each now has an explicit accessible name
  and a percentage or pixel value. Browser role/name/value probes passed 3/3;
  the live author create/edit/publish scenario passed with those assertions.
- Publishing with no title or language now places the corresponding error next
  to the field, sets `aria-invalid`, and focuses that field. Correcting it
  removes the stale inline error. A live Chromium validation journey passed.
  A 390 px iPhone 13 WebKit probe confirmed both focus states, nearby error
  text and no horizontal overflow. The remaining form and native zoom/device
  sweep stays open.

### 2026-09-30 — Account settings validation recovery (section 7)

- Password and email-change forms previously collapsed field-specific API
  validation into a form-bottom message. Current/new password and new-email/
  current-password errors now appear beside their fields, expose `aria-invalid`
  and focus the first invalid control. Non-field failures still use the form
  message, and editing a field clears its stale error without discarding values.
- A live Chromium password journey returned 400 for both incorrect current and
  weak new passwords, then confirmed field focus, inline text, retained entries
  and error clearing on edit. The existing full email-change journey returned
  400 for an incorrect password, confirmed field focus and inline text, then
  completed confirmation and rejected token reuse. Both targeted browser cases
  passed. ESLint, TypeScript, Prettier and 148 frontend unit tests passed.

### 2026-09-30 — Browser smoke CI installation failure (section 105)

- CI run `36756020431` for source `fb096a4` completed with seven successful
  implementation jobs, including 53 live full-stack flows and both production
  image builds, but its release gate failed. The standalone browser smoke job
  reached its 20-minute limit before tests started. Its log shows that
  `playwright install --with-deps` was still downloading Ubuntu packages from
  the runner mirror (81 of 181 new packages by cancellation). This is missing
  smoke evidence, not a passing check or a product test failure.
- The smoke job is changed to use the official version-matched Playwright
  `v1.61.1-noble` image with browser binaries and system dependencies already
  installed. The pinned tag was checked with `docker manifest inspect`; the
  full replacement job and release gate still require an exact-source CI run.
