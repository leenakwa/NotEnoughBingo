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

### Remaining local evidence to gather

- Broader invalid input cases, keyboard and responsive flows for newly added
  controls, and real service-outage behavior remain in the work queue. None of
  the external launch gates has been closed by these local tests.
