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

### 2026-09-30 — Pagination failure and retry states (section 4)

- The Discover/Trending feeds, profile activity, notifications and comments
  could keep the previous page's rows visible after a failed page change while
  the pagination label had already advanced. Page changes now clear the old
  collection before loading; failed list requests clear stale rows while
  preserving a visible error and retry. The profile/notification list promises
  also ignore a response after its request was aborted.
- A Chromium browser scenario served page one, returned HTTP 503 for page two,
  observed the first board disappear and the error appear, then retried and
  observed only page-two content. A focused CommentsPanel test covered the
  same failed-page/retry path; it passed 5/5. The full frontend gate passed
  ESLint, TypeScript, Prettier and 149 unit tests. The local Playwright smoke
  matrix passed 108 scenarios across Chromium, Firefox, WebKit and mobile
  emulation, with 12 intentional platform skips. The remaining
  component-by-component UI-state audit stays open.

### 2026-09-30 — WebKit first-login CSRF bootstrap (sections 10–11, 73, 105)

- CI run `36759454885` on source `2981986` passed foundation, secret scan,
  frontend and backend quality, browser smoke using the pinned Playwright
  image, and both production images. The full-stack job passed 53 of 54
  scenarios but failed the live WebKit compatibility journey at its first
  login, leaving the release gate red. The trace showed the bootstrap GET
  returned 200 and set the CSRF cookie; the subsequent login POST carried
  that cookie but omitted the `X-CSRFToken` header and received 403. No
  credential or token value was copied into this log.
- The CSRF endpoint now returns Django's masked token in the JSON response as
  well as setting the cookie. The client uses that response token on the first
  unsafe request and shares one bootstrap request across concurrent callers.
  This avoids relying on immediate browser cookie visibility; later requests
  still use the cookie. An isolated PostgreSQL API test passed with enforced
  CSRF checks, and a frontend test passed with an unreadable cookie and two
  concurrent unsafe requests. Ruff, format and mypy passed on the touched
  backend files; schema generation passed; the frontend gate passed ESLint,
  TypeScript, Prettier and 150 tests. The live WebKit compatibility flow passed
  three repeated local runs. CI run `36762027128` on exact source `cb812e2`
  then passed all nine jobs: 191 backend tests, 150 frontend tests, 54 live
  product flows, browser smoke, both production images and the release gate.
  Browser smoke recorded one static WebKit assertion that passed on retry;
  the original selector matched both the transient Explore loading screen and
  final Explore page. The test selector has been narrowed to the page element
  that exposes `aria-busy`; five repeated local WebKit runs passed. That
  adjustment requires its own CI run.

### 2026-09-30 — Security email support destination (section 45)

- The old-address email-change notice and critical security messages told
  recipients to contact support immediately without giving a destination.
  Verification, password-reset, email-change and critical security messages
  now include the configured public `/support` URL in their plain-text bodies.
  Production frontend configuration requires a support email on that page.
- Four PostgreSQL cases confirmed the configured HTTPS origin is used for the
  password-reset and both verification-link variants, and that verification,
  old-address email-change and critical security notices include the support
  URL. All four targeted cases passed; Ruff, format and mypy passed on the
  touched backend code. Delivery,
  sender authentication and inbox rendering remain unverified without a
  domain and transactional email provider.

### 2026-10-03 — Runtime image security refresh (sections 48, 72, 105)

- Exact-source CI run `36763640431` on `a847b76` completed with successful
  backend/frontend quality, secret/foundation, browser smoke, full-stack and
  frontend-image jobs. The backend-image job and release gate failed: the
  Debian OpenSSL packages had fixable High findings CVE-2026-75804 and
  CVE-2026-84782. This replaces the earlier pending status; that source is not
  a passing release artifact.
- The backend production layer now upgrades installed base packages before
  installing runtime libraries. CI pulls the base and excludes the production
  stage from its build cache, so an old successful runtime layer cannot hide
  new security package fixes. The deployment runbook records the corresponding
  manual Buildx flags. Python dependency locks are unchanged.
- An initial OpenSSL-only repair exposed another fixable system-package
  finding, CVE-2026-103111 in PCRE2. The final base-package upgrade installed
  OpenSSL `3.5.7-1~deb13u3` and PCRE2 `10.46-1~deb13u3`. Native Python SSL,
  PIL, psycopg and reportlab imports succeeded. `hadolint backend/Dockerfile`
  passed. Trivy `0.70.0 image --scanners vuln --severity HIGH,CRITICAL
  --ignore-unfixed --exit-code 1` passed for the final local arm64 backend image
  with zero selected findings. This does not assert absence of all
  vulnerabilities or prove the pending x86_64 CI build.
- Debian's [OpenSSL first advisory](https://security-tracker.debian.org/tracker/CVE-2026-75804),
  [second advisory](https://security-tracker.debian.org/tracker/CVE-2026-84782)
  and [PCRE2 advisory](https://security-tracker.debian.org/tracker/CVE-2026-103111)
  list the fixed trixie-security versions. The cache/pull inputs were checked
  against [Docker's build action documentation](https://github.com/docker/build-push-action#inputs).

### 2026-10-03 — Profile validation and intended interface changes (sections 7, 15, 24)

- The user confirmed all subsequent local UI edits are intentional. Account
  forms open over the current page, registration language choice is a one-time
  dialog, settings retain language preferences, and catalog/search language
  pickers are removed. Fixed-header and hover/shadow changes are retained. The
  original prompt remains byte-for-byte intact; page-level language-picker
  requirements are superseded by this later instruction.
- Profile username/display-name/bio validation now exposes errors beside their
  controls, links them with `aria-describedby`, sets `aria-invalid`, clears
  stale field errors on edit and retains other entries. The initial timer-based
  focus attempt failed in a real browser because inputs were still disabled.
  Focus now follows the React commit that reenables inputs. A real PostgreSQL
  duplicate-username response returned 400, focused the username, retained the
  Unicode bio, and a corrected retry returned 200. The targeted Chromium test
  passed; screenshots at 320 and 1710 px were inspected with no horizontal
  overflow. Inline error text no longer inherits the muted hint color.
- The frontend gate passed ESLint, TypeScript, 161 unit tests and Prettier.
  Generated `.playwright-cli/` snapshots were already Git-ignored but caused
  formatting failures; they are now also excluded from formatting checks.
- The three new static UI suites completed 67/68 checks across Chromium,
  Firefox, WebKit and mobile emulation. The single WebKit failure was a
  development HMR chunk load error recorded by the page-error assertion; all
  UI/focus/Axe assertions in that case passed. Three focused WebKit repeats
  then passed without errors. A wider smoke sweep passed 172, skipped 12
  platform-specific cases and failed four instances of an outdated test that
  still expected signup navigation. That assertion now checks the signup
  dialog and unchanged page. The combined-source regression remains in progress.
- The frontend arm64 production image built with an explicitly synthetic HTTPS
  preview origin and support identity; Trivy's High/Critical fixable-finding
  gate passed. The later session-recovery correction still needs an updated
  production artifact and exact-source CI. No public provider or domain was
  configured or deployed.

### 2026-10-03 — Session recovery with account dialogs (sections 4, 13, 14, 73)

- Updating the expired-session tests to the intended dialog UI exposed a real
  editor failure: unsaved cells survived login, but the failed-fingerprint guard
  prevented autosave from resuming. Successful login now clears that guard;
  normal conflicts still require explicit resolution.
- A confirmed authenticated-to-guest transition now emits a session-ended
  event. Profile, notifications, editor and play recheck their access/state
  while the login dialog stays over the current route. This also hides private
  profile controls after cross-tab logout. A different editor account triggers
  a reload to recheck draft ownership and discard the previous account's
  in-memory editor state.
- Three targeted Chromium cases passed against the isolated `nebqa` stack:
  expired-session editor recovery, a protected progress save returning 401
  followed by successful login/recovered save, and cross-tab logout with
  hidden private profile fields after closing the dialog. Added a reload
  persistence assertion and a separate different-account editor regression;
  both passed in the combined live run. The different account saw an ownership
  error, no previous-account cell, and no Save draft control. The recovered
  original-account cell survived reload after autosave.
- The combined live run passed 54/56. A profile dirty-navigation test exposed
  that hints nested in labels had changed the accessible field names; the
  three profile controls now use explicit label references while hints/errors
  remain descriptions. Both profile validation and dirty Back/Forward,
  navigation-warning and save cases then passed in a targeted rerun.
- The other failure was WebKit reporting two same-origin session fetches as
  access-control errors when a test immediately unloaded the initial document.
  The trace places them after the next hard navigation begins; subsequent
  session responses were 200 and every user-flow assertion passed. The
  compatibility scenario now clicks Explore, submits Search and opens the
  result card through the interface. It keeps page-error assertions and its
  reload-persistence checks. After correcting the new search locator to its
  native searchbox role, three repeated WebKit runs passed with no page errors.
- All four corrected guest-signup smoke cases passed across Chromium, mobile,
  Firefox and WebKit. The 161-test frontend gate, formatting, Dockerfile lint,
  diff whitespace check and 105-section/1,142-item checklist integrity check
  passed. The draft release still needs CI on the final combined source;
  the local results above must not be represented as a green release gate.

### 2026-10-03 — Database structural inventory (section 42, partial)

- Read-only Django/PostgreSQL introspection compared the application models
  with the isolated running database: 31 managed application tables, 47 named
  explicit indexes, 37 named explicit constraints, 62 unique/primary-key
  fields, 67 foreign keys and 67 nullable columns. Every named index/constraint,
  field uniqueness, foreign key and column-nullability check matched; no schema
  mismatch was reported. No rows were changed during this inspection.
- This establishes installed structure, not high-volume query performance.
  Catalog/author and notification filter/sort queries still need representative
  data and query-plan inspection; migration lock/runtime measurements and the
  target database deployment/backup/rollback contract remain open.

### 2026-10-03 — Scaled database migration and base query plans (section 42)

- Added two reproducible operation scripts: `infra/scripts/audit-database-schema.py`
  is read-only and verifies named constraint types, unique fields, foreign-key
  targets and column nullability; `infra/scripts/audit-database-scale.py`
  requires an explicitly opted-in development PostgreSQL connection and no
  custom database routers. It creates its own randomly named disposable database,
  verifies the connection switched to it, and removes it in `finally`.
- The scale drill created 200 disabled synthetic users, 10,000 published boards,
  20,000 revisions and 180,000 cells. It downgraded the isolated schema to
  `bingos.0002`, reapplied the current migration graph, and verified all four
  row counts, all 10,000 first/latest publication timestamps and current titles,
  the old-board `und` language default, and all 180,000 image-description
  defaults. Final script execution exited 0; seeding took 19.015 s, schema
  downgrade 0.115 s and upgrade 10.179 s. The original QA database was not
  selected for writes; cleanup reported the disposable database removed.
- After `ANALYZE`, actual base queryset `EXPLAIN ANALYZE` execution times were:
  latest page 6.354 ms; popular page 0.226 ms; one author's page 0.082 ms;
  case-insensitive title substring 4.699 ms. Popular and author paths used
  their existing composite indexes. Latest and substring paths used sequential
  scans; the synthetic catalog intentionally shares publication timestamps.
  These are one local SQL-plan observation each, excluding API serialization,
  joins/prefetch hydration, network, cold I/O and concurrent traffic. They do
  not establish target hosting latency or million-row performance.
- The strengthened structural audit passed on all 31 current QA tables with
  no missing/type/target/nullability mismatch. Ruff passed for both scripts.
  Section 42's structural and scaled-migration bullets now have explicit
  evidence; defaults across every model, full transaction coverage, target
  deployment ordering/compatibility, off-site recovery and rollback remain open.
- The schema script also passed from its committed-path candidate. Running
  the scale script without the opt-in rejected execution before database
  creation. A PostgreSQL catalog query then confirmed zero databases with
  the drill's temporary prefix. Both scripts passed Ruff and formatting;
  the full 105-section/1,142-item checklist integrity check passed.

### 2026-10-03 — Combined interface source release gate (sections 48, 72, 73, 105)

- GitHub Actions run [37066759036](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37066759036)
  completed successfully for PR source `e6a54dc022bee21e06e57dc71aad4a8468c7b04a`.
  All nine jobs passed: foundation, secret history scan, backend/frontend
  quality, static browser smoke, full-stack flows, both production images,
  and the release gate. Counts were 194 backend tests, 161 frontend tests,
  176 browser smoke checks with 12 platform-specific skips, and 56 live flows.
- The x86_64 backend/frontend image gates built the final combined application
  source and passed fixable High/Critical vulnerability scans, non-root checks
  and SBOM generation. No images were promoted to a registry or deployed.
  This resolves the preceding OpenSSL package gate and combined UI regression
  uncertainty; it does not close unreviewed original checklist items.
- The subsequent database scripts (`4f740f8`) and browser-error collection
  change are newer than this successful run and require a new source gate.

### 2026-10-03 — Browser error diagnostics (section 63, partial)

- Added browser observers for uncaught errors and unhandled promise rejections,
  reporting from route/root error boundaries, and reporting of unexpected API
  5xx, invalid-response, timeout and network failures. Expected validation/access
  responses and intentional aborts do not trigger API diagnostics. Reports use
  the same-origin `client-errors/` endpoint independently of the API client,
  preventing recursive reports if collection or CSRF bootstrap fails.
- Reports include enum-only kind/type/page category, optional HTTP status and
  up to eight line/column positions in already-loaded same-origin Next chunks.
  They omit error text, URL queries/fragments, usernames, form/content values,
  third-party script locations and arbitrary rejection objects. The server
  rejects unknown fields, unapproved names/paths, traversal and excess frames,
  enforces CSRF for guests, a 4 KiB body limit and 20 reports/client/minute
  alongside normal API throttles. The client deduplicates and bounds its queue
  to five reports/minute, with an eight-second independent reporting deadline.
- A regression exposed an unknown-field serializer exception returning 500;
  it now produces a normal 400 before capture. Twelve collector API tests pass,
  including installed-SDK transport, private-marker filtering, schema rejection,
  anonymous CSRF, body bounds and throttling. Capture retains generic error type,
  chunk positions, page category and synthetic environment/release, removing
  request/user/extra metadata even when those exist on the SDK scope.
- `npm run check` passed ESLint, TypeScript and all 166 frontend unit tests;
  `npm run format` and `npm run build` passed. New unit cases cover omitted
  sensitive content, response-token CSRF bootstrap, bounded deduplication and
  timeout without retries. Generated OpenAPI and TypeScript contracts were
  refreshed; schema validation and the checked-in/generated comparison passed.
- `tests/e2e/browser-errors.spec.ts` passed in Chromium, mobile Chromium,
  Firefox and WebKit. It triggers real uncaught errors and unhandled rejections,
  submits login against a synthetic 503, inspects the sanitized report bodies,
  then makes collection unavailable and confirms the account dialog closes
  and the support page remains usable without horizontal overflow. Injected
  private-marker exceptions are intentional; unrelated page errors fail the test.
- A separate Chromium journey against `nebqa` at 320 px accepted a report with
  a real CSRF header and backend 204, omitted the private marker and preserved
  the usable support/dialog flow. No external Sentry DSN was configured or
  contacted. The installed SDK event model was also checked against Sentry's
  [JavaScript event example](https://docs.sentry.dev/api/events/retrieve-an-event-for-a-project/).
- The full backend suite under `config.settings.test` passed 205 with one skip
  (Nginx template outside the backend-only container; CI checks it). Mypy passed
  all 74 source files; Ruff lint/format passed the repository backend. An initial
  suite invocation inherited development/S3 settings and failed four storage
  cases with 403; repeating with explicit test settings passed them. The skip
  was confirmed with `pytest ...test_production_configuration.py -q -rs`.
- Updated the privacy notice and operator runbook. Environment/release metadata
  currently describes the receiving backend; an old browser tab may still run
  an earlier chunk hash. Actual provider delivery/grouping, alert delivery,
  accurate old-tab release correlation and private source-map upload remain
  open. Public source maps remain disabled. Section 63 stays partial; only its
  frontend/unhandled-promise/API-capture bullets are newly checked.

### 2026-10-03 — Historical documentation secret-scan false positive (section 72)

- CI on `618486d` reported one generic-key finding in the preceding database
  audit commit `4f740f8`, not in browser diagnostic code or test credentials.
  The flagged evidence lines describe the request processing, data joins,
  network and concurrent traffic omitted from the SQL timing measurement.
- Added an exact commit/file/rule/line fingerprint to `.gitleaksignore` with
  the reason. No path-wide, rule-wide or credential-pattern exemption was
  added; the historical evidence remains intact. The new source requires a
  fresh history scan and release gate.
- The full redacted local Gitleaks scan passed across all 72 existing commits
  after this exact fingerprint was added. Final committed-source CI remains
  the release gate.


### 2026-10-03 — Exact-source release gate after browser diagnostics

- [CI run 37071307831](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37071307831)
  on `29ac99b007572bf2d99d165083619c42a076ce6d` passed all nine jobs.
  Results: 206 backend tests, 166 frontend tests, 179 browser smoke checks
  (12 intentionally skipped) and 57 full-stack flows; both x86_64 production
  image vulnerability/non-root/SBOM gates and the full-history secret scan
  passed. The backend-only container's missing Nginx-template skip did not
  occur in CI. No artifact was promoted, merged or deployed.

### 2026-10-03 — Social form retention, submission and focus (sections 7–8, partial)

- Before the fix, a live root-comment draft disappeared when following Explore
  without any warning. The regression reproduced in `nebqa`; after the fix,
  cancelled anchor navigation retains the exact multiline/emoji/literal text.
  The existing unload warning is also enabled while these forms are dirty.
- Root comment, reply, edit and report submissions now use synchronous action
  guards, lock the submitted fields while pending and retain values on failure.
  Re-clicking the active Reply/Edit control preserves its text. Cancelling or
  switching dirty inline forms, changing their comment page, or closing a dirty
  report dialog requires confirmation. Successful deletion closes a stale editor.
- Social inputs expose required/optional status and their 2,000-character limit.
  Report success points its accessible description to the actual success region,
  focuses Done and returns focus to the invoking Report control after closing.
- `npm run check` passed 172 frontend tests, ESLint and TypeScript;
  `npm run format` passed, including the live fixture isolation adjustment. New component cases cover
  same-tick duplicate submissions, failure retention, inline discard cancellation
  and accessible report success. The final helper adjustment was included in
  this quality and formatting check. `npm run build` also passed; its generated
  Next route-type path change was restored afterward.
- Six related live Chromium scenarios passed together on source-mounted `nebqa`:
  both new social-form journeys plus existing zero-data, report scroll-lock,
  social action and multilingual/long-comment paths. The new cases create and
  clean up separate unlisted boards so shared empty-state fixtures remain empty.
  A broad existing Like selector was scoped to the bingo action bar after the
  combined run exposed ambiguity with comment likes.
- At 320 and 1710 px, the dirty report dialog had no horizontal page overflow or
  Axe violations, and screenshots were inspected. The success dialog also had
  no Axe violations. Delayed real POSTs confirmed pending locks and HTTP 201;
  repeated native form submission emitted one report request.
- Limits: this does not prove password-manager autofill, per-field social error
  placement, network response-loss retry idempotency, or draft recovery through
  client Back navigation/session expiry. Those remain open. Sections 7–8 stay
  partial and their all-form/all-control checklist bullets remain unchecked.


### 2026-10-03 — Silent autofill values at submission (section 7, partial)

- Four auth component regressions reproduced empty submitted values when input
  DOM properties were filled without dispatching React change events. Login,
  registration, reset request and reset confirmation now read the submitted
  form with `FormData`, synchronize controlled values and preserve them after
  rejection. Email/username boundary whitespace is trimmed; passwords retain
  their exact characters. Registration confirmation uses the submitted address.
- Account password, email-change and deletion forms use the same submission
  rule. Password confirmation compares the actual filled fields before any
  request, and deletion has an explicit input name. No credential was added to
  browser storage or diagnostic events. Eight added component cases cover the
  four auth forms and account confirmation/submission/failure retention.
- `npm run check` passed all 180 frontend tests, lint and TypeScript;
  `npm run format` and `npm run build` passed. Sixteen new browser checks passed
  in Chromium, mobile Chromium, Firefox and WebKit, using actual DOM values
  without change events and asserting request payload plus rejection retention.
  The existing twenty auth smoke scenarios also passed across those projects.
- Two targeted Chromium scenarios passed against `nebqa`: the new account
  journey sent actual filled values in three real backend requests, received
  expected 400 validation and retained the inputs; existing field validation
  still identified/focused the password field. The first harness invocation
  incorrectly used the success-only response helper for expected 400s; replacing
  it with an explicit response wait corrected the test, without a product change.
- Three further live flows passed: registration/Mailpit verification/login,
  reset email/session expiration/token reuse, and verified email change/reused
  link rejection. This verifies the affected successful submit paths locally.
- Limits: these are deterministic silent-fill compatibility checks, not direct
  tests of native browser saved credentials or a specific password-manager
  extension. Those original bullets remain open; section 7 stays partial.
  The new source still needs its own committed CI gate.


### 2026-10-03 — Social-form source gate and autofill history scan

- [CI run 37073927578](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37073927578)
  on `b46645623b515aaa561fdff1dca895ab6328eec1` passed all nine jobs:
  206 backend tests, 172 frontend tests, 180 smoke checks (12 intentional skips),
  59 live flows, both production image scans/non-root/SBOM checks, foundation,
  full-history secret scan and release gate. These results cover social-form
  changes and their isolated fixture cleanup, not the later autofill source.
- Autofill implementation source `78f31fe` subsequently passed a full redacted
  local Gitleaks history scan over 75 commits with no findings. Its final live
  response-wait adjustment also passed TypeScript and targeted ESLint. Exact
  committed-source CI is still required for those later changes. No merge,
  registry promotion or deployment has occurred.


### 2026-10-03 — Social field validation and committed-render focus (section 7, partial)

- Comment creation, reply and edit now map backend `body` validation to the
  submitted field. Report reason/context validation appears beside each field.
  Error text is associated through `aria-describedby`, invalid inputs expose
  `aria-invalid`, and changing a field clears only its own error. General
  failures still use the existing action-level message. Entered text is retained.
- A live browser regression caught focus being attempted before a temporarily
  disabled textarea was enabled by React. Validation focus now runs after the
  committed state enables the field, using a one-use ref. Report errors focus
  the first invalid reason/context field after the pending state ends.
- Five new component cases cover root/reply/edit and both report fields, checking
  retention, focus, accessible description and correction. The final
  `npm run check` passed all 185 frontend tests, ESLint and TypeScript;
  `npm run format` and `npm run build` passed. Build-generated Next route-type
  imports were restored afterward.
- Three related live Chromium scenarios passed together on isolated `nebqa`:
  the new field-validation journey and the existing unsent-root and inline/report
  discard/submission journeys. The new test deliberately changes outgoing text
  to 2,001 characters (and injects an invalid report reason), then exercises
  real backend HTTP 400 parsing, retained visible text, enabled controls and focus
  for all three comment forms and both report fields. This is fault injection,
  not a claim that the ordinary 2,000-character browser limit can be exceeded.
- Report error layouts were inspected at 320 and 1710 px; both had no horizontal
  page overflow or Axe violations. Correcting reason leaves context validation
  visible until context is edited. No unrelated page exceptions were recorded.
  A changed report reason also counts as dirty when closing an unsent dialog.
- Section 7 stays partial: native saved credentials/extensions, recovery across
  client Back/session expiry and the remaining all-form sweep are still open.
  This new implementation still requires its own committed-source CI gate.


### 2026-10-03 — Autofill gate, a WebKit retry and later live-gate failure

- [CI run 37074991151](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37074991151)
  on `1f4a773624e696bc243033e6ca8982857a951526` passed all nine jobs:
  206 backend tests, 180 frontend tests, 195 smoke checks plus one WebKit check
  passed on retry (12 intentional skips), 60 live flows and both production
  image gates. This covers the silent-fill correction, not later social fixes.
- That WebKit browser-diagnostics test clicked an SSR login link before client
  initialization and navigated to the functional login page instead of opening
  the expected dialog. It now waits for the client's session check before
  clicking, as the existing auth-dialog test does. Three consecutive WebKit
  diagnostics repetitions passed locally without retries.
- [CI run 37076012518](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37076012518)
  on `eca929819cca8485d43072999145599e46bdac1e` failed its live/release gate:
  57 live cases passed, one failed and three did not run. Backend/frontend,
  foundation, secret scan, smoke and both production image jobs succeeded.
  Do not describe this later source as green.
- The failure was the session assertion immediately after a successful password
  change. The trace shows the browser's new-session request for sessions returning
  200; the separate test API request for `me/` sent only the CSRF cookie and
  received 401. Cookie values were compared in memory and never printed. This
  proves the API assertion did not send the browser's authenticated session; it
  does not establish the underlying automation-cookie synchronization cause.
  The assertion now makes a same-origin request from the actual browser and
  requires 200 without retry. The reset/change-password flow and existing
  two-tab logout/editor cleanup passed locally with this correction. A fresh
  exact-source gate remains required.

### 2026-10-03 — Root comment recovery and explicit sign-out (sections 7/58, partial scope)

- A live client Back/Forward regression reproduced an empty comment after returning
  to the board. Root comment text now restores from an account/board-scoped
  in-memory cache. The UI explains the lifetime and announces restored text.
  Nothing is written to localStorage/sessionStorage or diagnostics; native
  document-unload protection remains. Clearing/posting removes the record.
- Retention is bounded to 64 recent board drafts and 24 hours. Switching accounts
  purges old data, and a generation guard rejects delayed writes after sign-out
  or an owner change. Guest/owner changes key the comment component separately,
  preventing another viewer from inheriting its controlled input state. Server
  rendering does not read or mutate this browser cache.
- Explicit logout, current-session revocation and scheduled deletion publish a
  dedicated sign-out signal. Local events clear this tab; storage and
  BroadcastChannel signals clear other tabs and revalidate their headers, without
  transmitting identity or draft text. Normal auth refresh and session-expiry
  events preserve recovery for the same account. Constructors/storage failures
  are handled; local clearing does not require either cross-tab mechanism.
- Six cache tests cover board isolation, exact multiline/Unicode text, empty
  removal, bounds/expiry, owner changes, delayed writes and sign-out with normal,
  unavailable or cross-tab storage. A component regression covers guest hiding,
  same-owner recovery and different-owner purge; successful post asserts removal.
  `npm run check` passed all 192 frontend tests, lint and TypeScript. Final
  formatting and `npm run build` passed after the privacy text/channel addition;
  generated Next route imports were restored afterward.
- Nine related live Chromium scenarios passed together before the channel fallback
  addition: social errors/discard/pending behavior, Back/Forward, a real backend
  401 after removing browser credentials followed by same-owner login, explicit
  two-tab logout, existing editor cleanup, password reset/change and email change.
  The fallback then passed three related journeys, including two-tab sign-out with
  the sender's auth-sync storage write deliberately blocked. Fresh login sessions
  keep the shared fixture sessions valid for following scenarios.
- Restored root-comment layouts were inspected at 320 and 1710 px with no
  horizontal overflow or Axe violations. The privacy notice describes memory-only
  retention and the 64-record/24-hour limits.
- Limits: this recovery currently covers the root comment only. Reply, edit and
  report drafts still need account-scoped recovery, stale-target handling and
  equivalent navigation/auth cleanup evidence. Closing/reloading the document
  clears memory; recovery is not a server draft. Cross-tab fallback with both
  messaging and storage unavailable remains unverified. The full forms verdict
  remains partial, and the new source needs its own CI gate.


### 2026-10-03 — Account-scoped report recovery (section 7, partial scope)

- The bounded tab-memory cache now covers root comments and reports through one
  shared owner/generation/sign-out policy. Its 64-record limit applies to the
  combined set, with the same 24-hour lifetime. Report keys include account,
  target type and target ID; reason-only reports are also retained. No report
  text is written to persistent storage, auth signals or diagnostics.
- Reopening Report for the same target after client history navigation or
  same-account reauthentication restores its reason and exact multiline text.
  The dialog announces recovery and explains its lifetime. Explicit Cancel/close
  after confirmation and successful sending clear the record. Target/account
  changes remount controlled input state; signed-out/loading viewers cannot
  retain a visible report dialog. The privacy notice describes combined retention.
- Three additional cache cases cover report/comment namespace isolation, reason-only
  drafts, clearing and delayed writes after logout. Three component cases cover
  remount recovery, account/target changes and rejected unavailable targets;
  existing send/discard tests assert cache removal. `npm run check` passed lint,
  TypeScript and all 198 frontend tests. Formatting and the final production
  build passed; generated Next route-import changes were restored afterward.
- Eight related live Chromium journeys passed together on isolated `nebqa`: four
  new report flows plus existing dirty-form, validation, root Back/Forward and
  blocked-storage cross-tab logout regressions. The new flows exercise reopening
  after client Back/Forward; real report submission and removal after send/cancel;
  real backend 401 after clearing browser credentials followed by same-account
  login; real backend 400 after the author archives the target; and explicit
  logout from another tab followed by a fresh login with no report recovery.
  The rejected report retains context and its original destination; it is not
  silently redirected. Fresh sessions preserve shared fixture credentials.
- Restored report layouts were inspected at 320 and 1710 px, with no page-width
  overflow or Axe violations. Sending/Cancel remain reachable. Initial negative
  live assertions used a helper that rejects every non-2xx response; they were
  corrected to await and assert the intentionally expected 401/400 directly.
- Limits: users reopen Report for recovery; the modal is not automatically opened
  on return. A full reload/tab close clears memory. Reply/edit recovery, explicit
  context handling for deleted/moved comment targets, native credential managers
  and the remaining form sweep stay open. Simultaneous loss of both cross-tab
  signals remains unverified. This later source still requires its own CI gate.


### 2026-10-03 — Root-comment exact-source gate completed

- [CI run 37079164214](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37079164214)
  on `8a5d31a1378a60e2946f36324ba3d499f88dcc86` passed all nine jobs:
  206 backend tests, 192 frontend tests, 196 browser smoke checks (12 intentional
  skips), 64 live product flows and both x86_64 production image gates. Smoke
  output reports no retry/flaky cases. The corrected password-session assertion,
  hydration wait and root-comment recovery are covered by this source gate.
- The later report-recovery source `a9b3cc47a270a663621765f928e24b7c05bf0784`
  passed the local checks above and a full redacted 79-commit history scan. Its
  [own CI run 37080041237](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37080041237)
  subsequently failed as recorded below; it does not inherit the preceding
  source's green verdict. No merge,
  image promotion or public deployment occurred.


### 2026-10-03 — Later report gate failed; fixture ordering and departing-document diagnostics

- [CI run 37080041237](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37080041237)
  on `a9b3cc47a270a663621765f928e24b7c05bf0784` finished with failure:
  seven implementation jobs passed; full-stack/release failed with 63 live cases
  passed and five failed. The report source must not be described as green.
- Four new report cases ran after the existing destructive player-password
  scenario, which changes that fixture's password and revokes its original
  session. Their failures were absent authenticated Report controls (three
  cases) and rejection of the original password during fresh login (one case).
  These independent initial-session cases now run before the destructive account
  phase; fixture credentials are not restored or forged to hide the behavior.
- The fifth failure was a WebKit page error from the diagnostic collector's CSRF
  request. Its trace locates `sendReport` called by an old-page request failure
  during `clearCookies` followed immediately by navigation. Cookie values and
  trace bodies were never printed. The collector now avoids starting/reporting
  after `pagehide`, resumes on `pageshow`, and uses keepalive for already-started
  bounded requests. A bootstrap completed after departure cannot send a report.
- Two lifecycle regressions exercise suppression, resumption and a delayed
  bootstrap. Three consecutive live WebKit browse/search/play/share/editor
  journeys then passed with their existing empty-page-error assertion unchanged.
  No new exception filter or retry was added. The new source needs its own gate.


### 2026-10-03 — Reply/edit recovery with original conversation context (section 7)

- Root, reply, edit and report drafts now share bounded account-scoped tab memory
  (64 records, 24 hours, no persistent text). Reply/edit records retain the exact
  target, text and saved list page; edits also retain their original comparison
  text. Empty dirty edits are preserved. Sending, explicit discard and sign-out
  clear recovery; owner/generation checks reject late writes after account changes.
- The authenticated `GET /api/v1/comments/{id}/context/` returns the target, its
  parent when nested, and the board ID, without a list-page dependency. It uses
  the existing board-access policy, excludes moderated targets/parents and
  returns only tombstones for deleted text. Mutation authorization is unchanged.
  Ten API regressions cover pagination-independent nested context and viewer
  like state, guest/private/archived/draft/deleted/hidden board boundaries, private
  owner access, moderated parents/targets and deleted-text suppression. The
  21-test social suite passed; the full PostgreSQL/test-settings suite passed
  215 with one backend-container-only Nginx skip, covered by CI infrastructure.
- Restored conversations are included once when outside the current list page,
  including a reply outside the first five prefetched replies. Successful save
  or reply stays visible and clears recovery. A missing saved page returns to
  page one while retaining work. Changed server text is shown with a review
  warning before saving; that stale-edit warning has component evidence here.
- Deleted targets retain editable/copyable text with disabled sending; failed
  context loads keep a labeled read-only recovery textarea with its error
  description, retry and confirmed discard. Failed lookup never converts the
  text to a root comment or changes its target. Different-board context is
  rejected. Discard from fallback returns focus to the root composer.
- Two cache regressions and seven component regressions cover inline isolation,
  empty dirty edits, owner changes/late writes, nested/moved context, completion
  removal, deleted/unavailable/wrong-board targets, retry and vanished list pages.
  Together with two diagnostic lifecycle cases, `npm run check` passed all 209
  frontend tests, lint and TypeScript. Changed-file formatting passed.
- The guarded fixture command now seeds a separate unlisted social board with
  24 root comments and six replies, emitting no comment-service notifications.
  Its repeatability test verifies five boards/30 comments and correct parent
  links. Production/debug/explicit-opt-in guards are unchanged; all three fixture
  tests passed. This is test setup; subsequent mutations use the real browser/API.
- The full local five-project Playwright run passed all 72 live journeys without
  retries on isolated `nebqa`: Chromium, mobile WebKit, Firefox, desktop WebKit
  and Android emulation. Four new Chromium cases verify a real new comment
  moving the original conversation to page two while a sixth nested reply is
  being edited; real save/post and removal; forced missing credentials yielding
  401 then same-owner login; two-tab explicit logout; real comment deletion with
  retained text and disabled sending; and an injected context-request failure
  followed by retry to the original target. The four reordered report cases
  and the later destructive password/session flow also passed in this full run.
- Restored and deleted-target inline layouts were inspected at 320/1710 px and
  passed the comments-panel Axe and overflow checks. Early navigation tests
  pressed Back before Explore entered history and returned to the initial blank
  page; they now await the actual route, without sleeps. The fallback uses
  explicit label/error associations for consistent browser label lookup. The
  edited-body assertion includes the visible edited indicator.
- Limits: full reload/tab close still clears memory; this is not a server draft.
  Simultaneous loss of both cross-tab sign-out mechanisms, native saved
  credentials/password-manager extensions and the remaining all-form/control
  inventory stay open. The 105-section tracker remains partial for forms/storage.
  Current source still requires an exact-source CI gate; no deployment occurred.

- Final production `npm run build` also completed successfully for this packet
  after the accessibility labels and privacy copy were finalized. Generated
  Next.js route imports were restored to the committed development declaration
  paths. The final 320/1710 px screenshots were visually reviewed; recovery
  text, warnings and disabled controls remain readable within the viewport.


### 2026-10-03 — Bounded reply-list queries with real serializer relations (sections 34/82)

- A new PostgreSQL API regression compared one item with a full 24-item page,
  using distinct authors, profile avatars and thumbnail derivatives, likes,
  and six replies per root. Both guest and authenticated list responses are
  checked, including the five-reply preview cap and parent/like/thumbnail fields.
- Before the fix, both reply-list cases failed: SQL count grew from 7 for one
  reply to 30 for 24 replies. Serialization read each reply's parent public ID
  through a separate query. The root-list cases already passed.
- The reply list now includes `parent` in its existing `select_related` query.
  After the fix, root pages use 8 queries and reply pages 6 queries at both
  sizes, for guests and signed-in viewers. All four growth/absolute-budget
  regressions and the existing 21 social tests passed together (25 total).
  Ruff lint and formatting passed for both changed backend files.
- The real Chromium moved-conversation journey also passed after the fix:
  expand all six replies, edit the sixth, navigate back, recover original
  targets, save/post, and verify removal of sent drafts. No response schema,
  permission, pagination or preview limit changed.
- These measured local query counts cover social list joins and serialization;
  they do not establish public hosting latency, cold I/O, total catalog scale
  or concurrent-load budgets. Sections 34/42/82 retain their remaining scope.
- Recovery candidate `e6858a0` was pushed after the full redacted 80-commit
  history scan passed. Its exact-source CI is tracked independently at
  https://github.com/leenakwa/NotEnoughBingo/actions/runs/37083192633 .
  This later query correction requires its own source gate. No deployment occurred.


### 2026-10-03 — Inline recovery source gate completed

- [CI run 37083192633](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37083192633)
  on `e6858a0604cdf64b89cc9697a9263381f923988e` passed all nine jobs:
  216 PostgreSQL backend tests, 209 frontend tests, 196 browser smoke checks
  with 12 intentional skips, all 72 live product journeys and both x86_64
  production image gates. Smoke output reports no flaky/retry cases.
- This gate includes the reordered report journeys, departing-document
  diagnostics and root/reply/edit/report recovery; it supersedes the failed
  report candidate's verdict only for this source. No merge or deployment occurred.
- The later reply-query correction `8299cbf894609995042d9a6ebc312f6c30e1e442`
  passed its four query regressions plus 21 social tests, the real expanded-reply
  browser journey and a redacted 81-commit history scan. It was pushed after
  the previous run finished; its own gate is tracked at
  https://github.com/leenakwa/NotEnoughBingo/actions/runs/37084030161 .
  Subsequent changes do not inherit this gate.


### 2026-10-03 — Reply-query candidate gate completed, with two smoke retries

- [CI run 37084030161](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37084030161)
  on `8299cbf894609995042d9a6ebc312f6c30e1e442` passed all nine jobs:
  220 PostgreSQL backend tests, 209 frontend tests, all 72 live journeys
  and both production image gates. Smoke reported 194 passes, two WebKit
  cases passing on retry and 12 intentional skips; do not describe it as a
  retry-free 196-pass run.
- The dialog trace shows an early header Log in click navigating to the
  standalone login page before the editor's guest entry had rendered. The
  modal test now selects the editor's `main` Log in action, which appears
  after its session check. The Axe failure occurred during evaluation of
  the early login shell; that loaded-form audit now waits for its Email input.
- A new scenario deliberately holds client scripts, clicks the server-rendered
  header link, then releases scripts and verifies the standalone login form is
  usable. It checks the native fallback instead of suppressing its navigation.
  The two corrected checks and this scenario passed three consecutive WebKit
  repetitions (nine checks) and all four smoke browser projects (12 checks),
  each with retries disabled. The delayed-script case then gained an explicit
  assertion that at least one script request is held; that final version passed
  in all four projects too (four checks). No sleep, new retry or console-error exception
  was added to these checks. The next candidate needs its own full gate.


### 2026-10-03 — Email expiration and delivery failure recovery (sections 12/42/45/69)

- Verification and email-change messages now show the stored expiration as an
  explicit UTC date/time, including custom TTLs and time already spent queued.
  The previous fixed 24-hour statement could be incorrect. Queued password
  resets now check the token against the current account before sending, so
  expired or password-invalidated links are skipped. API/token schemas, retry
  policy and recipients are unchanged. The origin regression now uses an
  actually valid generated token and UID.
- A corrected baseline had eight transport-retry cases passing and four
  expiration/invalidated-link cases failing. Fifteen new PostgreSQL regressions
  now pass: each of four installed Celery retry wrappers recovers after two
  SMTP disconnects with one message, or raises after six attempts with none;
  recipients and non-silent sending are checked. Additional cases cover timed
  reset expiry, password changes, actual verification/change-email expiration
  and used/expired/missing verification records. Wrapper tests do not wait on
  countdowns or contact a real provider. The initial eager-recursion harness
  was corrected to exercise explicit task request contexts.
- All 46 email/account cases passed. The full local backend suite passed
  234 with the documented infrastructure-file skip; full Ruff lint and format
  passed (167 files), and `mypy apps` passed on 71 source files.
- A separate guarded drill checked the exact `nebqa` project and development
  origin, created one disposable verified account, stopped only its Mailpit,
  and requested a reset through the actual CSRF-protected API (202). Worker
  logs recorded a real retry. After Mailpit restart the message arrived, its
  link matched the configured QA origin, the real confirmation API returned
  204, and the same task logged SUCCESS. No cookies, credentials, tokens or
  mail bodies were printed. `finally` restored Mailpit and removed the account;
  a subsequent database count confirmed zero drill accounts. The local script
  is `/tmp/neb-mail-outage-drill-oct03.py`, with metadata-only output in
  `/tmp/neb-mail-outage-drill-oct03.log`. Two initial harness calls used incorrect
  endpoint/field names (404/400); both restored the service/account, and the
  corrected complete drill exited 0.
- The real registration/verification/login, reset/outage/session/reuse, and
  email-change/old-and-new-inbox journeys passed together (three cases). An
  initial reused-QA-mailbox run selected an old reset link from a previous
  fixture incarnation. The test now snapshots existing message IDs before
  requesting a new reset and waits for a new matching message, without deleting
  old mail or weakening token checks. Frontend lint/types and 209 tests passed;
  the later smoke helper edits passed targeted ESLint, TypeScript and formatting.
- Limits: the real failure drill covers local SMTP and the QA queue. It does
  not prove external sender verification, SPF/DKIM/DMARC, provider limits or
  delivery, real-device inbox rendering, or production alerts. The original
  checklist retains those requirements. No merge, promotion or deployment occurred.


### 2026-10-03 — Completed email/smoke source gate and frontend release identity (sections 63/81/103)

- Exact source `94ee15009aae17b50ffbef9f1d0cf76acd69ab35` passed all nine
  [CI jobs](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37085971270):
  235 PostgreSQL backend tests, 209 frontend tests, 200 smoke passes with 12
  intentional skips and no retries, 72 live product journeys, foundation and
  history secret scan, both x86_64 production image scans/SBOMs, and release gate.
  Completed output is `/tmp/neb-ci-94ee150-completed-oct03.log`. The earlier
  watch command ended on a GitHub network EOF while the run remained active;
  no workflow was restarted. Terminal state was checked with the run API/log.
- Browser errors previously inherited the receiving backend's SDK release,
  which misidentified an older open tab after a backend rollout. Frontend
  diagnostics now send the loaded bundle's embedded `NEXT_PUBLIC_APP_RELEASE`
  as the optional `X-NEB-Client-Release` header. The closed JSON body is unchanged,
  so older collectors can ignore this new header. The current collector accepts
  only a full lowercase 40-character Git SHA, sets `frontend-<sha>`, and explicitly
  sets `frontend-unknown` for legacy/malformed values. This public client metadata
  is untrusted and has no effect on authentication or authorization.
- Production Docker builds require the actual source SHA, record `.built-release`,
  and reject runtime relabeling. Compose uses `APP_RELEASE` for the development
  frontend. CI supplies its actual checkout SHA to smoke/live/image builds and
  adds a production-image validator/mismatched-release regression. OpenAPI's
  optional-header contract and generated TypeScript declarations match.
- All 17 collector cases passed, including six real installed-SDK transport
  variants with a different synthetic backend release: two frontend identities,
  absent, arbitrary private marker, oversized and uppercase metadata. Filtering
  retained no request/user/extra content. Frontend tests prove a loaded module
  keeps its initial identity after the test environment changes, omits invalid
  identities, and rejects missing/mutable/runtime-mismatched production values.
  Full frontend lint/types and 221 tests passed; focused diagnostics/config had
  28 passes. Full backend had 239 passes plus the documented infrastructure-file
  skip; Ruff lint/format and `mypy apps` (71 files) passed.
- The diagnostics journey passed without retries in Chromium, mobile Chromium,
  Firefox and WebKit, checking release headers alongside the unchanged sanitized
  bodies and recovery after collector failure. A temporary local production image
  built successfully and its validator accepted the built identity and rejected
  a runtime override. Its served production bundles passed the same journey at
  1710×989 Chromium and 320×800 WebKit, proving build-time substitution rather
  than only a mocked module environment. The test image deliberately used the
  previous source SHA as a synthetic identity for the current working tree; it
  is not a release artifact. Logs: `/tmp/neb-release-image-build-oct03.log`,
  `/tmp/neb-release-smoke-oct03.log`, `/tmp/neb-release-production-browser-oct03.log`.
- A separate real `nebqa` Chromium journey accepted the report with real CSRF
  and HTTP 204 at 320 px, preserved support/dialog use and leaked no private
  marker. Its existing development frontend has no release set (legacy case).
  `/tmp/neb-release-live-oct03.log`. No external monitoring provider was contacted.
- Section 63's release/version tagging and appropriate source-map policy bullets
  are now checked. The source-map decision already recorded under section 81
  and the deployment runbook is unchanged: no public maps; provider upload is
  not configured or required for launch. Older evidence listing upload as a
  mandatory open gap is superseded by this explicit policy. Section 63 remains
  partial for actual provider delivery/grouping, target environment/configuration
  and alerts; section 103 still requires its other original bullets. Counters
  remain 55 verified / 43 partial / 6 N/A / 1 deployment-only. No merge,
  promotion or deployment occurred; the new source still needs its own CI gate.


### 2026-10-03 — Completed frontend-release gate and partial account settings (sections 4/5/7/8)

- Exact source `b5ebaff57dcd73fce6091ce1d33613aa328ab0d0` passed all nine
  [CI jobs](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37086991543):
  240 PostgreSQL backend tests, 221 frontend tests, 200 browser smoke passes
  with 12 intentional skips and no retries, 72 live product journeys, foundation
  and history scan, both x86_64 production image gates and release gate. The
  frontend image's embedded-release check and runtime-relabel rejection passed.
  Full terminal log: `/tmp/neb-ci-b5ebaff-completed-oct03.log`. No run was restarted.
- AccountSettings previously coupled identity, sessions and notification
  preferences with Promise.all: one optional request failure or delay hid all
  controls, including password change and logout. After a successful password
  change, a failed sessions refresh entered the password error handler and
  concealed its success. These are concrete partial-data and feedback defects.
- Identity remains required before rendering account controls. Sessions and
  notification preferences now load independently in parallel with their own
  loading/error/retry states. Retrying one section refetches only that resource;
  preferences have no guessed checkbox defaults before they arrive. Password
  success clears the credential fields, retains success feedback and triggers
  a separate sessions refresh. Old session rows are cleared while refreshing.
  Requests now accept AbortSignal and ignore aborted results during cleanup.
  The user's intentional layout, dialogs and language-picker removals are retained.
- Five new settings regressions initially produced four failures and one pass
  (the required-identity boundary already worked). All 14 settings cases now
  pass: optional failure/retry isolation, slow preferences without blocking
  security controls, required-identity failure, password success with failed
  sessions refresh, and the existing account/deletion/avatar/form cases.
  Logs: `/tmp/neb-partial-settings-baseline-oct03.log` and
  `/tmp/neb-partial-settings-fixed-oct03.log`.
- Full frontend lint/types and 226 tests passed, as did production Next build,
  targeted formatting/ESLint and final types. Build-only generated next-env
  route imports were restored. Logs: `/tmp/neb-partial-settings-check-oct03.log`,
  `/tmp/neb-partial-settings-build-oct03.log`, `/tmp/neb-partial-settings-types-oct03.log`.
  No backend implementation changed, so its unchanged full suite was not repeated.
- Two actual QA Chromium journeys returned synthetic 503s only for the chosen
  optional resource, kept password/logout/profile controls usable at 320 and
  1710 px, passed Axe with zero violations, and retried into real backend data.
  Counters confirmed retry did not refetch identity or the other settings section;
  no page errors or overflow occurred. The initial two runs passed interaction
  checks but failed an incorrect exact-one initial-request expectation: development
  Strict Mode had made two initial GETs. The assertion now uses observed pre-retry
  counts and checks exactly one additional request only for the failed section.
- The existing real reset journey was extended: reset email and token reuse,
  login, actual password change, a subsequent sessions-list 503, independent
  retry, logout and login using the changed password all passed. It checks success
  feedback and empty credential fields, local section error and absent stale
  session rows. Together the two section cases and reset journey passed three
  without retries in `/tmp/neb-partial-settings-live-fixed-oct03.log`.
- Both optional-failure journeys also passed on actual QA using mobile WebKit,
  Firefox and mobile Chromium: six cases without retries, with the same Axe,
  320/1710 layout, control and request-isolation assertions.
  `/tmp/neb-partial-settings-browsers-oct03.log`; temporary config
  `/tmp/neb-partial-settings-browser.config.ts`. This is desktop browser/device
  emulation, not native physical-device testing.
- Section 4 remains partial for the other component families. The next itemized
  partial-data sweep is editor draft/metadata hydration, Explore suggestions,
  player optional author/progress/comments, and header unread counts. Sections
  5/7/8 still retain their broader open requirements. Counters remain 55 verified,
  43 partial, 6 N/A, 1 deployment-only. The new source needs its own CI gate;
  no merge, image promotion or public deployment occurred.


### 2026-10-03 — Completed partial-settings source gate

- Exact source `73810423ad68d197ae9717e282fa54c617257286` passed all nine
  [CI jobs](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37087884457):
  240 PostgreSQL backend tests, 226 frontend tests, 200 browser smoke passes
  with 12 intentional skips and no retries, 74 live product journeys, foundation
  and history scan, both production image scans/SBOMs and release gate.
  Terminal log: `/tmp/neb-ci-7381042-completed-oct03.log`. This gate covers the
  settings changes, not the later editor changes. No workflow was restarted;
  no image was promoted or deployed.

### 2026-10-03 — Independent editor draft/export hydration and obsolete read protection (section 4)

- The editor coupled its required draft with a board-detail read used only to
  check published-download availability. A slow/failed optional read blocked
  opening the valid draft. Its required-draft success callback also lacked an
  abort check: a delayed response could hydrate the previous board after the
  component had moved to another one. A failed next-board load could leave
  the prior board visible because the error condition checked only for any
  loaded board ID, rather than the requested ID.
- Draft and published-download checks now start independently, preserving
  parallel requests. The required draft must match the requested board before
  editable controls are shown. Failed draft loads expose Retry for that read
  only. Optional download loading/failure appears beside the download controls,
  permits continued editing/saving, and has a separate retry without rehydrating
  the draft or discarding text. Unknown availability no longer misleadingly
  says that an already published board must be published. Both read callbacks
  ignore aborted responses. This covers initial reads; pending mutation/route
  transitions remain a separate part of the full editor lifecycle audit.
- Four added regression cases initially failed, with the existing 15 editor
  cases passing. They cover failed/slow optional data, independent retries,
  required draft failure and late old-board responses. A fifth added regression
  proves a failed next-board load hides the already loaded previous board and
  triggers no autosave of it. All 20 editor cases plus one details case now pass;
  full frontend lint/types and 231 tests, formatting and production build passed.
  Logs: `/tmp/neb-editor-partial-baseline-oct03.log`,
  `/tmp/neb-editor-partial-final-tests-oct03.log`,
  `/tmp/neb-editor-partial-final-check-oct03.log`,
  `/tmp/neb-editor-partial-build-oct03.log`. Generated build-only next-env imports
  were restored. Backend implementation and API payload contracts are unchanged.
- Two real QA Chromium flows use separate temporary authored boards: a synthetic
  503 for the optional board read leaves the draft editable; retry does not
  refetch the draft or alter its typed title. Saving is verified by reading the
  actual backend draft. The other flow returns a draft 503, confirms zero grid
  cells/edit controls, and retries into the real nine-cell draft without another
  board-detail read. Temporary boards are removed by the existing guarded cleanup.
  The first initial run selected both the intended alert and Next's route
  announcer, causing a strict-selector failure. It was corrected to the details
  panel's alert; both flows then passed without retries, with no page errors.
  `/tmp/neb-editor-partial-live-fixed-oct03.log`.
- Both flows also passed in mobile WebKit and Firefox, four cases without retries.
  The optional-data case checks 320/1710 px layout, editable preserved text,
  no horizontal overflow and Axe with zero violations. Logs/config:
  `/tmp/neb-editor-partial-browsers-oct03.log`,
  `/tmp/neb-editor-partial-browser.config.ts`. These are browser/device emulations,
  not physical-device evidence. No private tokens or auth state were printed.
- Section 4 stays partial for other component families. Remaining immediate
  partial-data paths are Explore suggestions, player optional author/progress/
  comments, and header unread counts; pending editor mutations/route transitions
  also need their own evidence. Counters remain 55 verified / 43 partial / 6 N/A /
  1 deployment-only. The editor changes still require their own exact-source CI.
  No merge, promotion or public deployment occurred.


### 2026-10-03 — Completed editor source gate

- Exact source `371dd1b7b8f058fd5a5c1eb7eb84db01fec3cd6f` passed all nine
  [CI jobs](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37088753125):
  240 PostgreSQL backend tests, 231 frontend tests, 200 browser smoke passes
  with 12 intentional skips and no retries, 76 live product journeys, foundation
  and history scan, both production image scans/SBOMs and release gate.
  Terminal log: `/tmp/neb-ci-371dd1b-completed-oct03.log`. This gate covers the
  editor hydration changes, not the subsequent catalog/player changes.
  No workflow was restarted; no image was promoted or deployed.

### 2026-10-03 — Catalog/read lifetime and independent player data (sections 4, 17, 58)

- Explore's success callbacks could restore obsolete catalog results or author/tag
  suggestions after filters changed or cleared. Discover had the same late-response
  issue after a sign-in refresh. Both now ignore aborted successful responses;
  changing a suggestion field clears its previous options immediately, including
  the debounce interval. Header unread counts reset on account/path changes and
  ignore late results from the previous account. Optional badge failure leaves
  navigation available. The user's intentional removal of visible catalog/search
  language pickers is preserved; no picker was reintroduced.
- Player loading awaited optional author/follow details before reading marks.
  An initial progress failure then enabled empty marks, allowing subsequent play
  to replace saved progress. Author details now load independently. Unknown saved
  progress keeps cells/sharing disabled and offers an explicit retry. Retry
  reloads board/session/progress through the existing loading path, rather than
  being a progress-only request. A genuine 404 means no previous progress and
  still allows first play. Obsolete progress success is checked before updating
  its shared version. Optional author lookup was also removed from the server
  page's awaited HTML path (source inspection; no server latency measurement).
  Pending writes across routes/accounts remain a separate lifecycle audit.
- Player/header baseline: three new cases failed while 17 passed. Explore's three
  new cases and Discover's one new case also failed against the prior callbacks.
  Fixes plus the added no-progress-404 regression pass in the complete frontend
  check: lint/types and 240 tests across 34 files. Production build passed.
  Logs: `/tmp/neb-player-partial-baseline-oct03.log`,
  `/tmp/neb-explore-partial-baseline-oct03.log`,
  `/tmp/neb-feed-lifetime-baseline-oct03.log`,
  `/tmp/neb-catalog-player-check-oct03.log`,
  `/tmp/neb-catalog-player-build-oct03.log`. Two test assertions initially used a
  Playwright-only option in Testing Library; types caught it and it was removed
  before the successful full check. No backend/API contract changes were made.
- Two real QA Chromium flows passed without retries. Synthetic browser 503s for
  author/tag hints and unread counts are observed by counters, while a real
  combined-filter search still finds the fixture board and Notifications opens.
  At 320/1710 px fields remain enabled, with no overflow and zero Axe violations.
  The first run scanned during a Next navigation and saw a transient empty title;
  the test now waits for URL, metadata title and the main loading state to finish
  before Axe. That run had one pass and one failure; corrected run has two passes.
- The player flow creates/removes a separate temporary board, writes one mark to
  the actual backend and then returns a synthetic progress GET 503. Cells/share
  remain disabled and no PUT occurs; direct backend reads retain the exact saved
  mark. Retry restores it while author details are held and comments return 503.
  A second user mark then persists to the real backend. Both 320/1710 px layouts
  have no overflow and both flows have no page errors. Log:
  `/tmp/neb-catalog-player-live-fixed-oct03.log`.
- Both new flows also passed in mobile WebKit and Firefox (four cases without
  retries). Logs/config: `/tmp/neb-catalog-player-browsers-oct03.log`,
  `/tmp/neb-catalog-player-browser.config.ts`. These are browser emulations,
  not physical-device evidence. Generated next-env imports were restored.
- Section 4 remains partial for the remaining component/state requirements.
  Immediate follow-up is pending editor/player mutations across route and account
  changes. Broader forms, control accessibility and target-environment items
  remain. Counts stay 55 verified / 43 partial / 6 N/A / 1 deployment-only.
  These changes need their own exact-source CI; no merge, promotion or deployment
  occurred. Provider-independent local evidence does not establish production.


### 2026-10-03 — Editor mutation lifetime, logout and separate new document (sections 4, 7, 58)

- A departed editor's pending creation could replace the current URL and continue
  saving newer edits; a late existing-board save could change the next editor's
  identifier/version. Publication could navigate after departure and export
  polling continued. Five added regressions initially failed with the prior 20
  editor cases passing. A separate added existing-draft-to-Create regression
  failed against the first lifetime correction: it still opened the old document.
- Editor operations now capture a lifetime invalidated on unmount, draft-route
  changes, sign-in, session end and explicit logout. Save loops stop before follow-up
  requests and after completed writes; obsolete success/error callbacks cannot
  replace URLs, update draft/version/recovery/status, or continue publication.
  Conflict reload/save choices and uploads use the same guards. Uploads are
  aborted; obsolete phases/assets are ignored. Export polling stops at the next
  wake/read completion and obsolete results cannot trigger a download/navigation.
  Session events immediately hide controls during revalidation. This does not
  cancel writes already accepted by the server; a lost response still uses existing
  idempotency/version/conflict rules. Physical account-switch timing and every
  player mutation remain separate requirements.
- Existing-draft-to-blank Create now resets document, draft identity/version,
  pending creation/publication keys, history/recovery references and visible save
  state to a separate blank 5x5 board. A newly persisted board's own URL update
  preserves its document. Autosave also waits for a requested existing-board ID
  to match the hydrated state. Existing recovery prompts remain available for
  account-scoped earlier unsaved documents; this reset does not delete them.
- Eight added editor cases now pass (28 total), covering departure/session end,
  next-board version, late publication, export polling, purged logout recovery,
  publication waiting on save and a separate blank document. The complete final
  frontend check passed lint/types and 248 tests across 34 files; build and
  formatting passed. One intermediate full run had 247 passes and a failure in
  the existing offline-reset player test; it passed in isolation. That test now
  waits for Reset to become enabled before clicking, and the final full run passed.
  This is one readiness-wait correction, not proof of eliminating all timing races.
  An initial upload guard was placed in the adjacent effect, caught by the editor
  tests, and moved into the upload handler before successful verification.
  Logs: `/tmp/neb-editor-mutation-baseline-oct03.log`,
  `/tmp/neb-editor-new-route-baseline-oct03.log`,
  `/tmp/neb-editor-mutation-check-final-oct03.log`,
  `/tmp/neb-editor-mutation-build-oct03.log`,
  `/tmp/neb-editor-mutation-format-oct03.log`.
- Two real QA flows hold actual successful server responses while the user leaves
  via Explore. Creation saves the first 6x6 snapshot; a second 7x7 edit is made
  while its response is held. After confirmed departure and released response,
  Explore remains open, no follow-up PUT occurs beyond the 800ms debounce window,
  and direct backend reads still show the first 6x6 snapshot. Publication similarly
  completes on the server but its departed UI does not navigate. Temporary boards
  are cleaned up. Six cases passed without retries in Chromium, mobile WebKit and
  Firefox: `/tmp/neb-editor-mutation-browsers-oct03.log`,
  `/tmp/neb-editor-mutation-browser.config.ts`. An initial draft-write counter used
  PATCH rather than this API's PUT; corrected final six-case run observes PUT.
- A third real Chromium flow follows the header Create link from an existing
  3x3 draft: URL loses its draft query, a blank 5x5 editor/title opens, and actual
  backend reads confirm the original board remains 3x3. It passed without retries:
  `/tmp/neb-editor-new-route-live-oct03.log`. Browser engine/device emulations
  are not physical-device or native password-manager evidence. Generated next-env
  imports were restored; no backend implementation or API contract changed.
- The pending player mutation/account queue, remaining component states,
  per-form/control/native-device checks and broader data/API/performance items
  remain open. Section counts stay 55 verified / 43 partial / 6 N/A /
  1 deployment-only. New source requires its own CI. No merge, promotion or public
  deployment occurred; domain/providers remain unselected.


### 2026-10-03 — Completed catalog/player source gate

- Exact source `6eaaf25efce153b6ca002dfe2dced947b68d2db0` passed all nine
  [CI jobs](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37090152888):
  240 PostgreSQL backend tests, 240 frontend tests, 200 browser smoke passes
  with 12 intentional skips and no retries, 78 live product journeys, foundation
  and history scan, both production image scans/SBOMs and release gate.
  Terminal log: `/tmp/neb-ci-6eaaf25-completed-oct03.log`. This covers the
  catalog/player read changes, not the later editor mutation changes. Full
  redacted local history scan covered 86 commits with no leaks. No workflow was
  restarted, image promoted, PR merged or public deployment performed.


### 2026-10-03 — Editor source gate failure and corrected lifecycle paths (sections 4, 7, 58)

- Exact source `6bcc3ef46f7922839a279f44b560749d4a2f453e` failed its
  [CI gate](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37090903842).
  Backend 240 tests, frontend 248 tests, smoke 200 passes plus 12 intentional
  skips without retries, foundation, history and both image jobs passed.
  Live flows had 39 passes, two failures and 40 not run; Release gate failed.
  The failures were the author creation/upload journey timing out waiting for
  draft PUT, and report authentication recovery's cleanup returning 403 instead
  of 204. Neither is reclassified as green. Terminal log:
  `/tmp/neb-ci-6bcc3ef-completed-oct03.log`.
- The editor lifetime guard incorrectly treated its own newly saved draft URL
  transition as departure. A user could start an upload after first save but
  before the Next route commit; that commit then aborted the upload. A new
  regression reproduced the aborted signal. Meaningful draft-route transitions
  and unmount still invalidate operations, but assignment of the newly saved
  board's own ID preserves its lifetime. This correction keeps genuine leave/
  other-board/logout guards. Editor now has 29 passing cases.
- Temporary-board cleanup now uses an isolated API context with the author's
  fixture state, instead of changing the live page's cookies. The observed
  cleanup 403 is consistent with overlapping page authentication/CSRF responses
  after cookie replacement; this cause is an inference, not a captured CSRF
  error body. Isolation removes that shared-cookie dependency and preserves the
  exact ownership/204 cleanup assertion. No response/auth headers were printed.
- Seven Chromium flows passed together without retries after these corrections:
  both departed editor cases, separate blank Create, both queued-player boundary
  cases, the failed report-recovery/cleanup case and full author create/save/
  image/edit/publish journey. The upload reached actual storage/backend and its
  expected draft PUT; report cleanup kept its strict 204 requirement. Log:
  `/tmp/neb-player-editor-lifecycle-live-oct03.log`. New source still needs CI;
  no workflow was restarted to hide the failed gate.

### 2026-10-03 — Player queued mutation and stale write protection (sections 4, 58)

- Player save chains could execute queued PUTs after departure or logout. Old
  progress conflicts could fetch/retry in the next scope, and an old successful
  save could replace the next board's version. Reset success could read again
  after departure; late sharing navigated and late likes updated the next board.
  Added regressions reproduce these behaviors. Two initial next-board tests used
  a summary title rather than the rendered revision title, so their first failure
  did not prove the intended assertion. After correcting the fixture title, both
  fail against the prior source at the actual stale version/stat assertions
  (next version 8 was replaced by old version 2). Logs:
  `/tmp/neb-player-mutation-baseline-oct03.log`,
  `/tmp/neb-player-mutation-next-board-baseline-oct03.log`.
- A player mutation lifetime now invalidates on load/route cleanup, unmount,
  sign-in, session end and explicit logout. It detaches the new scope's queue,
  resets action refs and disables hydration before new actions can proceed.
  Queued callbacks check it before requests; conflict reads/retries, reset reads,
  successful versions/recovery updates and errors check it after awaits. Like,
  follow, management and share callbacks guard state/navigation too. Existing
  request versions still order newer changes within the same lifetime. Already
  issued server writes can complete; this is protection against subsequent work
  and obsolete callbacks, not server cancellation or a new transaction policy.
- Seven added player cases plus the existing 11 now pass. Unit mocks reset their
  implementations/one-shot queues between cases and have realistic default save/
  reset results. The full final frontend check passed lint/types and 256 tests
  across 34 files, build and formatting. A missing mandatory `code` in the mock
  conflict payload was caught by types and fixed before the final check. Logs:
  `/tmp/neb-player-mutation-fixed-oct03.log`,
  `/tmp/neb-player-mutation-final-check-oct03.log`,
  `/tmp/neb-player-mutation-final-build-oct03.log`,
  `/tmp/neb-player-mutation-final-format-oct03.log`.
- Two real QA flows hold a successful actual first PUT, queue a second mark and
  then leave or explicitly log out from another tab. The logout flow creates a
  separate real session so shared fixture sessions remain valid. After the held
  response is released, no second PUT is sent and direct authenticated backend
  reads retain exactly one mark. Temporary boards use isolated author cleanup.
  Both flows passed in Chromium, mobile WebKit and Firefox: six cases without
  retries and no page errors. Config/log:
  `/tmp/neb-player-mutation-browser.config.ts`,
  `/tmp/neb-player-mutation-browsers-oct03.log`. Initial logout test setup used two
  nonexistent settings paths; it was corrected to the actual `/profile` before
  successful runs. These are engine/device emulations, not physical-device proof.
- Generated next-env imports were restored. Backend/API contracts and the user's
  intentional UI changes are preserved. Broader component states, forms/controls/
  native-device review, defaults/transactions/API matrices and representative
  joined/load paths remain. Section 58 still has the explicitly documented case
  where both cross-tab storage events and BroadcastChannel are unavailable.
  Section counts remain 55 verified / 43 partial / 6 N/A / 1 deployment-only.
  New corrections require their own source gate; no merge/promotion/deployment.


### 2026-10-03 — Shared-result required read lifetime (section 4)

- A shared-result component could display the previous snapshot while opening
  another link, and its unguarded success callback could replace the new result
  after the old request was aborted. Two new regressions initially failed with
  both existing play/copy/native-share unit cases passing. Required reads now
  clear the previous result and feedback, expose the existing loading/error/Retry
  states, and ignore successful aborted responses. Server-provided initial
  snapshots retain their existing fast path. Snapshot content and sharing APIs
  are unchanged; clipboard/native-share pending completion is a separate scope.
- Four shared-result cases pass, including failed next-link retry and late
  previous-link resolution. Full frontend lint/types and 258 tests across 34
  files, build and formatting passed. Logs:
  `/tmp/neb-share-read-lifetime-baseline-oct03.log`,
  `/tmp/neb-share-read-lifetime-check-oct03.log`,
  `/tmp/neb-share-read-lifetime-build-oct03.log`,
  `/tmp/neb-share-read-lifetime-format-oct03.log`.
- Two existing real Chromium journeys passed without retries on this local
  source: guest mark/reset/replay/share/read-only result, and a saved private
  draft whose already shared revision remains immutable through later editing
  and publishing. They use actual API/storage and verify disabled read-only
  cells. Log: `/tmp/neb-share-read-lifetime-live-oct03.log`. They verify normal
  journeys, while the new same-component link-transition/late-response states
  are unit-controlled evidence, not browser/network timing measurements.
  No layout/CSS or backend/API contracts changed. Generated next-env imports
  were restored. No new dedicated browser viewport claim is made.
- Remaining component-state/mutation inventory includes card like actions,
  notifications mark-read/mark-all, profile mutations, account upload/security/
  export/delete actions and clipboard/native-share completion scope. Existing
  happy-path evidence does not prove all their pending route/account boundaries.
  Section 4 remains partial; counts stay 55 verified / 43 partial / 6 N/A /
  1 deployment-only. This correction needs its own exact-source CI. No merge,
  promotion or public deployment occurred.


### 2026-10-03 — Failed player-source CI and editor native URL correction

- Exact-source gate for `07d3e41a41b06fd1831108ba44c68c6ede95db06`
  [run 37091894214](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37091894214)
  completed FAILED. Backend 240, frontend 256, smoke 200 passes plus 12
  intentional skips without retries, history/foundation and both image gates
  passed. Live had 82 passes and one failure; the release gate failed. Both
  previously failed `6bcc3ef` upload/report-cleanup cases passed here. The single
  live-WebKit compatibility journey collected uncaught `TypeError: Load failed`
  at its final page-error assertion. This was not filtered or accepted. Logs:
  `/tmp/neb-ci-07d3e41-completed-oct03.log`,
  `/tmp/neb-ci-07d3e41-live-failed-oct03.log`.
- Private trace inspection found the final reload overlapping the editor's
  own-draft RSC navigation; the request had received HTTP 200 shortly before
  reload. This is correlation, not proof of response-body cancellation. The
  editor performed native history replacement and redundant `router.replace`
  for the same newly saved draft. A new real browser regression fails on prior
  source (one RSC navigation versus expected zero). Removed the redundant
  navigation and made the route wrapper read `useSearchParams` under Suspense,
  so native history, direct reload and subsequent Create navigation stay in
  sync. Installed Next app-router source confirms native-history query sync.
  No generic page-error filter, retry count or backend contract was changed.
- Existing first-save unit assertions now check the native URL and absence of
  router replacement; departed creation assertions also check that the URL
  remains untouched. Five related Chromium editor flows passed, including
  delayed creation/departure, separate blank Create and the full image/save/
  publish journey. The previously failed WebKit compatibility journey passed
  three repetitions without retries. Logs:
  `/tmp/neb-editor-native-route-baseline-oct03.log`,
  `/tmp/neb-editor-native-route-live-oct03.log`,
  `/tmp/neb-editor-native-route-webkit-oct03.log`.

### 2026-10-03 — Card action lifetime, active profile tab and combined verification

- Card likes/unlikes now use a synchronous in-flight guard and an operation
  lifetime invalidated by card change, unmount and account/session events.
  Old successful callbacks cannot overwrite the next scope's count; obsolete
  authentication failure cannot navigate a departed page to Login. Already
  accepted server writes may finish. Three new regressions failed on prior
  source and pass with the existing six card tests. Log:
  `/tmp/neb-card-lifetime-baseline-oct03.log`.
- Two live cases hold actual successful like responses or a synthetic 403,
  double-click, leave for Explore, then release the response. Each sends exactly
  one write, retains Explore with no page errors, and verifies actual backend
  counts (one for success, zero for denial). They use temporary unlisted boards
  and strict isolated author cleanup. Chromium passed both initially. Log:
  `/tmp/neb-card-lifetime-live-oct03.log`.
- The first nine-case engine run had six passes and three failures: clicking an
  already selected Created tab could clear its loaded collection without a new
  request. The existing handler now returns early for the active tab. A focused
  unit regression failed before correction and now passes; browser tests keep
  the actual tab click. Logs:
  `/tmp/neb-card-native-route-browsers-oct03.log`,
  `/tmp/neb-profile-active-tab-baseline-oct03.log`.
- Final combined source passed lint/types, 262 frontend tests across 35 files,
  production build and formatting. Nine cases passed without retries across
  Chromium, mobile WebKit and Firefox: first save/native URL/reload/new Create
  and both delayed card outcomes. The editor case checks preserved text and no
  horizontal overflow at 320 and 1710 px. Config/logs:
  `/tmp/neb-card-native-route-browser.config.ts`,
  `/tmp/neb-card-native-route-browsers-fixed-oct03.log`,
  `/tmp/neb-card-share-native-profile-check-oct03.log`,
  `/tmp/neb-card-share-native-profile-build-oct03.log`,
  `/tmp/neb-card-share-native-profile-format-oct03.log`.
- This is engine/device emulation, not physical-device evidence. Shared-result
  link timing is unit-controlled; its two normal live journeys are recorded
  above. Notification read actions, profile mutations/optional viewer state,
  account upload/security/export/delete and clipboard/native-share pending
  completion remain in the component inventory. Player follow/management
  boundaries need dedicated cases. Counts remain 55 verified / 43 partial /
  six N/A / one deployment-only; section 4 stays partial. User UI changes are
  preserved. New source requires its own CI; no merge/promotion/deployment.


### 2026-10-03 — Native/card/shared-result candidate CI failed on session cookie rotation

- Exact-source `bdd953b85bd07a2587ea1fd44c7ff2eaa0649214` gate
  [37093719560](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37093719560)
  completed FAILED. Backend 240, frontend 262, history/foundation and both image
  gates passed. Smoke had 199 passes, one WebKit case passing on retry and 12
  intentional skips; it was not retry-free. Live had 82 passes, one failure and
  three not run; Release failed. The previously failed WebKit compatibility
  journey passed. Logs: `/tmp/neb-ci-bdd953b-completed-oct03.log`,
  `/tmp/neb-ci-bdd953b-live-failed-oct03.log`.
- The failed password-reset journey first loaded an authenticated current
  session, changed password successfully (204), saw the deliberate sessions
  outage (503), then its sessions retry returned 401. Private trace inspection
  confirmed a rotated cookie on password-change and a subsequent old analytics
  response deleting that cookie (202 with empty session cookie / Max-Age 0).
  This is a concrete server/browser cookie race, not just a missing selector.
  Only route/status/timing, cookie attribute and old/new/absent classification
  were inspected; no cookie values, passwords, reset links or raw trace bodies
  were printed.
- Standard Django session response handling deletes an empty session cookie
  even for an obsolete request. RotationSafeSessionMiddleware retains Django's
  normal processing and removes only implicit empty-cookie deletion. Invalidated
  server sessions remain rejected; explicit Django logout signals mark the
  underlying request so actual logout still deletes the cookie. The signal
  handles DRF wrappers and native Django requests. An invalid server-side key
  can remain in the browser until a subsequent login/logout or normal expiry;
  it grants no authentication. This prevents a late old request from erasing a
  newer valid cookie without delaying server-side revocation.
- Two server regressions failed on prior source: old request whose session loads
  after rotation, and old preloaded payload whose password hash is checked after
  rotation. Both now pass, plus explicit logout deletion/401. Full Ruff lint and
  format passed; mypy found no issues in 75 source files. A first full pytest
  invocation accidentally inherited QA development settings and had four S3
  HeadObject failures (238 passes/one skip). Re-running with the required
  `DJANGO_SETTINGS_MODULE=config.settings.test` passed 242 tests with one skip:
  the Nginx template is outside the backend container, covered by foundation CI.
  This was an environment correction, not relaxed storage assertions. Logs:
  `/tmp/neb-session-cookie-race-baseline-oct03.log`,
  `/tmp/neb-session-cookie-race-fixed-oct03.log`,
  `/tmp/neb-session-cookie-race-backend-{lint,format,types}-oct03.log`,
  `/tmp/neb-session-cookie-race-backend-tests-oct03.log`,
  `/tmp/neb-session-cookie-race-backend-tests-test-settings-oct03.log`.
- The real password-reset journey now deliberately holds analytics with the old
  request headers through password-change, forwards its actual backend response,
  requires no session-cookie deletion, then retries session details and verifies
  current device/authentication, logout and changed-credential login. Chromium
  passed without retries, using actual QA mail/backend and strict existing token/
  outage assertions. Cleanup releases held analytics even on failure. Log:
  `/tmp/neb-session-cookie-race-live-oct03.log`.
- The smoke retry was `pending requests keep the dialog open and prevent duplicate
  submission` in WebKit. Its trace confirms the click before client hydration
  followed the real /login fallback while the test awaited a dialog. The test
  now waits for the initial mocked session check, matching the existing modal
  scenario; the separate deliberately delayed-script fallback is retained.
  Both scenarios passed three WebKit repetitions each without retries. Log:
  `/tmp/neb-auth-pending-hydration-smoke-oct03.log`. No error filter or retry
  setting was loosened.

### 2026-10-03 — Notification and shared-result action boundaries (sections 4–5)

- Six notification regressions failed on previous source: mark-all completion
  changed the next page, old-account read error appeared in the new account,
  old notifications remained visible during account reload, duplicate same-tick
  all/individual reads issued two writes, and an authentication denial retained
  private rows. Operation lifetimes now invalidate on page/reload/unmount and
  account/session events; synchronous refs prevent duplicate writes. Account
  events clear rows/pending/error immediately and reset pagination. Required
  loads hide old rows and disable mark-all; action auth denial shows the existing
  private-account login state. Six regressions now pass. Logs:
  `/tmp/neb-notification-lifetime-baseline-oct03.log`,
  `/tmp/neb-notification-lifetime-fixed-oct03.log`.
- Two real notification flows hold a synthetic 503, double-click and leave or
  explicitly log out in another tab. They retain the destination/private login
  state without late errors, send exactly one action, and check the real new
  notification is still unread through isolated author API access. They use
  temporary unlisted boards and separate real logout sessions. Both pass in
  Chromium, mobile WebKit and Firefox (six cases without retries); the existing
  actual mark-all/persistence/target-navigation Chromium journey also passes.
  Logs: `/tmp/neb-notification-lifetime-live-oct03.log`,
  `/tmp/neb-notification-lifetime-browsers-oct03.log`.
- Five added shared-result action regressions failed with four prior tests
  passing: late copy/native-share completion appeared on the next result,
  simultaneous duplicate actions ran twice, and cancelled native sharing left
  earlier copy success visible. A per-link/retry operation lifetime now bounds
  feedback; synchronous refs and disabled buttons prevent duplicate operations;
  persistent pending feedback describes copying/sharing and cancellation clears
  previous success. Copy fallback/error feedback and native share APIs remain.
  All nine unit cases pass. Logs: `/tmp/neb-shared-action-baseline-oct03.log`,
  `/tmp/neb-shared-action-fixed-oct03.log`.
- Two actual shared-snapshot browser cases inject controlled clipboard/native-
  share promises to check duplicate protection, pending/disabled controls,
  copy-denial/native-cancel recovery, late departure and subsequent success.
  They check 320/1710 px overflow and no page errors. With the two notification
  cases, all 12 passed across Chromium, mobile WebKit and Firefox without retries.
  Actual normal guest mark/reset/replay/share/read-only flow also passed. These
  injected OS API outcomes do not prove physical-device system dialogs or native
  clipboard permissions. Same-component next-link timing is unit evidence;
  browser cases exercise actual route departure. Logs/config:
  `/tmp/neb-shared-action-live-oct03.log`,
  `/tmp/neb-notification-share-browser.config.ts`,
  `/tmp/neb-notification-share-browsers-oct03.log`.
- Combined frontend source passed lint/types and 273 tests across 36 files,
  production build and formatting. Test-only lint/type issues (unused mock
  parameter and Testing Library role options copied from Playwright) were fixed
  before the final checks. Logs:
  `/tmp/neb-notification-share-session-final-check-oct03.log`,
  `/tmp/neb-notification-share-final-build-oct03.log`,
  `/tmp/neb-notification-share-session-final-format-oct03.log`.
- Remaining component inventory: profile mutations/optional viewer state,
  account upload/security/export/delete lifetimes and dedicated player follow/
  management cases. Native physical-device verification, broader controls/forms,
  API/default/transaction/joined/load and target operations remain. Section 4
  stays partial; counts remain 55 verified / 43 partial / six N/A / one
  deployment-only. Source requires a new CI; no merge/promotion/deployment.


### 2026-10-03 — Synthetic regression-password history findings

- Source `82f2f07a3e3d3943932c5eef299d725cbc2e126a` full-history scan
  detected two generic-api-key matches in the newly added session-cookie race
  test, at lines 20 and 41. They are synthetic test passwords used only by the
  temporary test database, not provider credentials. The branch push completed
  before the failed scan result was inspected; CI run
  [37095323331](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37095323331)
  also failed its history-scan job. It completed FAILED: the history scan and Release gate failed, while the
  other seven jobs passed. Backend 243, frontend 273 across 36 files, smoke
  200 passes plus 12 intentional skips without retries, all 90 live flows,
  foundation and both image gates passed. Full log:
  `/tmp/neb-ci-82f2f07-completed-oct03.log`. No passing release gate is claimed
  for this source.
- Current regression passwords are generated with the standard-library
  token_urlsafe function and passed into the factory and API calls in memory.
  Ruff and all three focused server regressions pass after this test-only
  change. Two exact historical commit/file/rule/line fingerprints were added to
  .gitleaksignore, with a synthetic-test explanation; no directory/rule-wide
  exemption or history rewrite was added. The existing narrow prose fingerprints
  remain. A full redacted scan of all 90 commits then passed with no leaks.
  Logs: `/tmp/neb-notification-share-session-history-oct03.log`,
  `/tmp/neb-notification-share-session-history-report-oct03.log`,
  `/tmp/neb-session-cookie-historical-exemptions-oct03.log`,
  `/tmp/neb-session-cookie-race-generated-passwords-oct03.log`.
- The private JSON finding report was used only to inspect rule, path, line and
  fingerprint. No finding values or private trace/auth state were printed.
  The older GitGuardian dashboard incident still requires its own classification;
  a local scanner exception does not resolve an external incident automatically.


### 2026-10-03 — Generated-password source passes the complete release gate

- `eca815d1fe299da35240d5fcfa5a07a71c105d37`
  [run 37096117679](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37096117679)
  completed SUCCESS: all nine jobs passed, including full-history scanning,
  foundation, frontend/backend quality, both production-image scans/SBOM and
  Release gate. Backend 243, frontend 273 across 36 files, smoke 200 passes plus
  12 intentional skips without retries, and all 90 live flows passed. Log:
  `/tmp/neb-ci-eca815d-completed-oct03.log`. The redacted local full-history
  scan covered all 91 commits with no leaks after the exact historical
  synthetic-password classifications. Log:
  `/tmp/neb-session-cookie-generated-history-oct03.log`.
- This source gate is independent of the failed `82f2f07` scan/Release gate;
  that failed run remains recorded. New subsequent profile changes do not
  inherit this passing source gate. No merge, promotion or deployment occurred.

### 2026-10-03 — Profile required/optional loading and action lifetime (section 4)

- Seven new profile regressions failed on the previous source, with the own-
  profile session-denial control passing. A failed next required profile load
  could redisplay the previous profile; unknown viewer identity exposed Follow/
  Report; viewer lookup failure falsely presented guest login without retry;
  late profile, privacy, language and follow successes overwrote the next scope.
  Required reads now clear the previous profile, retain error/Retry and ignore
  obsolete success. Viewer identity has independent loading/error/Retry; protected
  controls require a known signed-in viewer. Viewer retry does not refetch the
  public profile or block its content. Log:
  `/tmp/neb-profile-lifetime-baseline-oct03.log`.
- Profile mutation lifetime invalidates on username/reload, unmount and account/
  session events. Account events clear profile/viewer data and pending/feedback/
  language state before loading the new account. Save/privacy/language/follow
  callbacks check ownership after awaits, including errors, rollback, auth-change
  notification and ref cleanup. Existing synchronous duplicate-action guard,
  profile edit recovery, field validation and dirty navigation warning remain.
  Already accepted backend writes can finish; no server cancellation is claimed.
- Eight profile cases pass; the full frontend check passed lint/types and 281
  tests across 37 files, production build and formatting. An initial React hook
  lint error from refs declared after the effect capturing them was fixed by
  declaring refs first; no lint suppression was added. Logs:
  `/tmp/neb-profile-lifetime-check-oct03.log`,
  `/tmp/neb-profile-lifetime-final-check-oct03.log`,
  `/tmp/neb-profile-lifetime-build-oct03.log`,
  `/tmp/neb-profile-lifetime-format-oct03.log`.
- Three real QA flows passed in Chromium, mobile WebKit and Firefox (nine cases,
  no retries): optional viewer outage/retry while public SSR content remains,
  and held save success/failure followed by departure. Viewer outage checks
  hidden protected controls, independent request counts, 320/1710 px overflow
  and Axe. Save success forwards the actual accepted backend response; failure
  is a held synthetic 503. Each checks one browser mutation, destination and
  no late feedback/page errors, verifies actual persisted/unmodified name and
  restores the original profile through isolated author API access. Existing
  dirty-form navigation is explicitly accepted. Logs/config:
  `/tmp/neb-profile-lifetime-live-oct03.log`,
  `/tmp/neb-profile-lifetime-browser.config.ts`,
  `/tmp/neb-profile-lifetime-browsers-oct03.log`.
- Same-component next-profile/account timing and privacy/language/follow late
  responses are controlled unit evidence. Browser cases exercise the actual
  viewer failure and save/departure paths; they do not prove every account
  mutation or physical-device condition. Remaining component inventory now
  prioritizes AccountSettings upload/security/preferences/export/deletion
  lifetimes (including its callbacks into ProfileView), and dedicated player
  follow/management cases. Broader forms/controls/native-device, API/default/
  transaction/joined/load and target operations remain. Section counts stay
  55 verified / 43 partial / six N/A / one deployment-only; section 4 is partial.
  User UI changes are retained. This new source requires its own CI.

### 2026-10-03 — profile gate failure and keyboard-test readiness

- Source `438a452208c97437988df3f509b73179d5d4df72` failed its full-stack
  and Release jobs: 91 live passes, one avatar keyboard assertion failure and
  one not run. Other seven jobs passed: 243 backend, 281 frontend/37 files,
  200 smoke passes plus 12 intentional skips without retries, foundation,
  secret scan and both images. Run:
  https://github.com/leenakwa/NotEnoughBingo/actions/runs/37097226581.
  Last fully successful source remains `eca815d`; its pass is not inherited.
- Private trace metadata places completion of the profile activity request
  between Shift+Tab and Tab. A controlled real-response hold reproduced the
  failure: the predecessor was the Created tab, then newly inserted card links
  received Tab. This is the correct changed DOM order, not lost avatar focus
  during an account action. Log:
  `/tmp/neb-avatar-focus-delayed-baseline-oct03.log`.
- The keyboard scenario now waits for the activity tabpanel's `aria-busy=false`
  before focusing the avatar and checking the adjacent Shift+Tab/Tab cycle.
  Focus, 3px outline, Enter and the native chooser assertions are unchanged.
  No sleeps, retries, product tab-order changes or error filtering were added.
  The same held actual response passes with this state gate at both 320/1710 px:
  `/tmp/neb-avatar-focus-delayed-fixed-oct03.log`. Three unmodified baseline
  repetitions had passed locally, explaining why simple repeats missed the
  request-order dependency. The controlled diagnostic was removed after use.
- User confirmation that all changes are intentional remains authoritative;
  catalog/search language pickers stay removed. Section counts remain
  55 verified / 43 partial / six N/A / one deployment-only.
- Final lint/types and formatting passed for the keyboard-test change. The
  unchanged focus/outline/Enter/native-chooser flow passes at 320/1710 px in
  Chromium and Firefox. Expanded mobile and desktop WebKit attempts fail the
  background chooser's adjacent Shift+Tab/Tab assertion before reaching the
  avatar; those attempts are recorded as failures, not cross-engine proof.
  Logs: `/tmp/neb-avatar-focus-browsers-oct03.log`,
  `/tmp/neb-avatar-focus-desktop-webkit-oct03.log`,
  `/tmp/neb-avatar-focus-types-oct03.log`. Their keyboard traversal remains an
  open browser-specific investigation. The configured CI chooser flow uses
  Chromium. This correction requires its own source CI.
