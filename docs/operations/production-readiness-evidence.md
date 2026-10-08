# Production readiness evidence log

Use this log with the [full prompt](production-readiness-prompt.txt)
and [105-section tracker](production-readiness-tracker.md). Each entry records
observed results and their limits. Do not include credentials or session data.
Historical machine-local paths identify original runs; raw reports and browser
diagnostics are retained outside the repository. Sanitized linked artifacts are
the portable evidence.

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

### 2026-10-03 — account action ownership and export polling

- Keyboard/activity source `4b5e8e469b07c348838c960555c9b41016c01233`
  passed all nine CI jobs: 243 backend, 281 frontend/37 files, 200 smoke passes
  plus 12 intentional skips without retries, 93 live journeys, foundation,
  full-history secret scan, both images/scans/SBOM and Release. Run:
  https://github.com/leenakwa/NotEnoughBingo/actions/runs/37098611723.
  The earlier `438a452` failure remains recorded.
- Ten corrected baseline regressions failed in AccountSettings, alongside 14
  existing passes: late upload continued to a profile write after departure;
  accepted avatar save called the next profile's callback; export creation
  started private reads after departure and polling continued after unmount;
  old preference/password/email results and logout/current-session/deletion
  redirects crossed account/page boundaries. Initial test-only incorrect label
  selectors were corrected before establishing the ten-case baseline. Logs:
  `/tmp/neb-account-lifetime-baseline-oct03.log`,
  `/tmp/neb-account-lifetime-baseline-corrected-oct03.log`.
- Account/profile/session boundaries now invalidate action ownership, abort
  avatar upload and clear credentials, pending state, export/deletion state and
  feedback. Reads check ownership plus their abort signal. Identity mismatch
  withholds private controls and asks for a profile reload. Each mutation checks
  ownership after awaits and before errors/final cleanup; old cleanup cannot
  unlock a new account's export. Avatar phase callbacks are guarded; cancelled
  uploads cannot attach even if their adapter resolves after abort. Export
  creation, reads and the next polling step stop after leaving the scope.
  Already accepted server writes/jobs can finish; no server cancellation or
  rollback is claimed. Normal logout/deletion notifications and navigation stay
  effective after the owning response succeeds.
- All 26 account tests pass, including active export polling/download and
  mismatched identity controls. Full frontend lint/types and 293 tests across
  37 files, production build and formatting pass. Initial test-only ByRole
  `exact` typing and export control labels were corrected without suppression.
  Final logs: `/tmp/neb-account-lifetime-final-guard-check-oct03.log`,
  `/tmp/neb-account-lifetime-live-types-oct03.log`,
  `/tmp/neb-account-lifetime-build-oct03.log`,
  `/tmp/neb-account-lifetime-format-oct03.log`. Generated next-env changes restored.
- Two real held-success flows (avatar PATCH and account export POST) each pass
  in Chromium, mobile WebKit, desktop WebKit and Firefox: eight cases. They
  check one mutation, 320/1710px overflow, departure, actual backend accepted
  avatar/job and no late feedback/page errors. The export UI makes zero job
  reads after departure; isolated author API access verifies the accepted job.
  Avatar cleanup restores the original asset via isolated author access. Normal
  avatar upload/removal persistence and ZIP export download also pass in
  Chromium. Browser logs/config: `/tmp/neb-account-lifetime-live-oct03.log`,
  `/tmp/neb-account-lifetime-browser.config.ts`,
  `/tmp/neb-account-lifetime-browsers-oct03.log`.
- The original expanded WebKit Shift+Tab/Tab failures are explained by a
  browser keyboard setting difference: Apple documents Option+Tab for
  traversing all clickable controls with default Safari settings:
  https://support.apple.com/en-lamr/guide/safari/cpsh003/mac. The keyboard flow
  uses Option+Tab in WebKit and plain Tab elsewhere, preserving predecessor/
  successor focus, 3px outline, Enter and filechooser checks. One first
  Option+Tab attempt reached its final page-error assertion but failed on an
  Agentation development chunk-load error; it was not filtered or counted as
  a pass (`/tmp/neb-avatar-focus-optiontab-webkit-oct03.log`). The unchanged
  checks subsequently pass in all four browser modes: four additional cases
  within the 12-case account/browser packet. These are headless/emulated
  keyboard/filechooser checks; physical iOS keyboards and native OS dialogs
  remain unverified.
- Account-switch/error/private-action timing beyond those avatar/export browser
  flows remains unit evidence. Dedicated player follow/management and the
  wider remaining forms/controls/device/API/default/transaction/joined/load/
  target-operations inventory remain open. Section counts stay 55 verified /
  43 partial / six N/A / one deployment-only. This new account source requires
  its own CI; it does not inherit `4b5e8e4`'s pass.

### 2026-10-03 — player social duplicate requests and management boundaries

- Three corrected baseline regressions fail: synchronous duplicate like/follow
  clicks send two requests, and starting a like does not synchronously lock a
  follow. Five new follow/management boundary controls already pass on the
  existing source, confirming its lifetime guards. Initial tests incorrectly
  changed only the board title while the player displays the revision title;
  fixtures were corrected before the three-case defect baseline. Logs:
  `/tmp/neb-player-social-baseline-oct03.log`,
  `/tmp/neb-player-social-baseline-corrected-oct03.log`,
  `/tmp/neb-player-social-baseline-final-oct03.log`.
- The existing synchronous management lock now covers like and follow too.
  All three handlers acquire it before dispatching a request and release it
  only within the owning lifetime. Board/session changes reset it; obsolete
  cleanup cannot unlock a new board's action. Existing progress guards,
  confirmation, author permissions, pending UI and error recovery remain.
- All 27 player tests and the full 302 frontend tests/37 files pass with lint
  and types. Dedicated controls verify late follow success/failure on another
  board and archive/restore/delete completion on another board, one management
  request for duplicate clicks, and failure/retry/follow/unfollow unlocking.
  Production build and formatting also pass. Logs:
  `/tmp/neb-player-social-check-oct03.log`,
  `/tmp/neb-player-social-types-oct03.log`,
  `/tmp/neb-player-social-build-oct03.log`,
  `/tmp/neb-player-social-format-oct03.log`. Generated next-env restored.
- Three real browser flows each pass in Chromium, mobile WebKit, desktop
  WebKit and Firefox: 12 cases without retries/page errors. A held actual
  follow/unfollow success or synthetic 503 completes after leaving for Explore;
  one request is dispatched and actual following state is checked through an
  isolated player API context, then restored. Archive forwards an actual
  accepted 200, preserves the destination after release and verifies archived
  server state. Temporary boards use existing isolated author cleanup.
  Chromium also passes normal archive/reload/restore/public-availability and
  the combined like/comment/reply/follow/report flow. Logs/config:
  `/tmp/neb-player-social-live-oct03.log`,
  `/tmp/neb-player-social-browser.config.ts`,
  `/tmp/neb-player-social-browsers-oct03.log`.
- Restore/delete delayed timing is unit evidence; archive and follow have the
  described real browser departure checks. This packet does not establish
  physical-device behavior or every account/form/control/API/load condition.
  Section counts remain 55 verified / 43 partial / six N/A / one deployment-only.
  Sections 4/5 remain open for the remaining component/state/control inventory;
  section 58 still needs simultaneous cross-tab storage/BroadcastChannel
  unavailability evidence. New player source needs its own CI.

### 2026-10-03 — missed explicit sign-out with both cross-tab channels unavailable

- Account source `808cb81cc5255e19cdcea23bbbc32ca94f4eb161` passed all nine
  CI jobs: 243 backend, 293 frontend/37 files, 200 smoke passes plus 12
  intentional skips without retries, 95 live journeys and both images/scans/SBOM.
  Run: https://github.com/leenakwa/NotEnoughBingo/actions/runs/37099333862.
  Player source `1a671eb74afcde567c89d4240a12de1b8707b87e` also passed all nine
  jobs: 243 backend, 302 frontend/37 files, 200 smoke plus 12 skips without
  retries and 98 live journeys. Run:
  https://github.com/leenakwa/NotEnoughBingo/actions/runs/37100203993.
  Complete logs: `/tmp/neb-ci-808cb81-completed-oct03.log`,
  `/tmp/neb-ci-1a671eb-completed-oct03.log`.
- The remaining section 58 case was reproduced: with auth-sync storage writes
  blocked and BroadcastChannel absent in both tabs, focus revalidation detects
  the guest session, but re-login as the same account restores the comment
  from the previous explicitly signed-out session. Browser baseline:
  `/tmp/neb-dual-auth-sync-baseline-oct03.log`. Header baseline has one failure
  and 11 passes; the three initial backend contract controls fail because the
  explicit-logout event field does not exist on the previous source. Logs:
  `/tmp/neb-logout-event-header-baseline-oct03.log`,
  `/tmp/neb-logout-event-backend-baseline-oct03.log`.
- Explicit Django logout now writes a signed, HttpOnly, seven-day browser
  notification cookie. It contains a random event ID, no account identity or
  authentication capability, and inherits session cookie Secure/SameSite/domain/
  path settings. Session status validates its signature/age and returns the
  nullable event with its existing private/no-store policy. Login retains it so
  a tab that missed both logout and re-login can still notice the event. Plain
  expiry/invalidated old-session reads do not create it. OpenAPI and generated
  frontend types are updated. Privacy copy states the purpose and retention.
- Header session lookup observes the event only for the current request version.
  A changed event dispatches the existing local signed-out signal, clearing
  private draft generations even when identity is unchanged. First lookup,
  unchanged events and cookie expiry do not cause a purge. Ordinary session
  expiry still preserves same-account reauthentication recovery. The event is
  not written to localStorage/sessionStorage and does not broadcast recursive
  auth-change notifications. Existing rotated-cookie protections remain.
- Full frontend lint/types, 305 tests/37 files, build/format and validated
  schema/type generation pass. Three header controls cover missed logout,
  ordinary expiry and obsolete responses; existing draft preservation controls
  pass. Backend full suite passed 246 tests plus the existing container-only
  Nginx skip; final secure/insecure-cookie parameter controls, accounts and
  rotated-cookie controls pass all 39 focused cases. The initial full run had
  one failure solely because a second strict guest-response assertion still
  expected the old JSON shape; it was corrected to require the new null field
  while retaining the two-request throttle check. Ruff/format (170 files) and
  mypy (75 source files) pass. Logs:
  `/tmp/neb-logout-event-frontend-check-oct03.log`,
  `/tmp/neb-logout-event-backend-tests-oct03.log`,
  `/tmp/neb-logout-event-backend-final-tests-oct03.log`,
  `/tmp/neb-logout-event-cookie-policy-tests-oct03.log`,
  `/tmp/neb-logout-event-backend-types-oct03.log`,
  `/tmp/neb-logout-event-build-oct03.log`,
  `/tmp/neb-logout-event-final-types-format-oct03.log`,
  `/tmp/neb-logout-event-schema-oct03.log`,
  `/tmp/neb-logout-event-api-types-oct03.log`. Generated next-env restored.
- Both missed-sign-out cases pass in Chromium, mobile WebKit, desktop WebKit
  and Firefox: eight cases passed without retries before adding the final
  two-tab page-error assertions. That stricter run passed seven cases and
  failed mobile WebKit after re-login on two rejected chunk loads; it is not
  a passing console-error gate. One returns to
  the first tab before same-account re-login; the other reauthenticates in the
  second tab first. Auth-sync writes are denied in both tabs and messaging is
  absent. Focus triggers a real session-status request; the private comment
  stays empty and recovery feedback is absent. Browser cookies confirm the
  marker is HttpOnly and document.cookie cannot read it. The existing
  storage-blocked/BroadcastChannel case also passes in Chromium. Logs/config:
  `/tmp/neb-dual-auth-sync-final-live-oct03.log`,
  `/tmp/neb-dual-auth-sync-browser.config.ts`,
  `/tmp/neb-dual-auth-sync-browsers-oct03.log`,
  `/tmp/neb-dual-auth-sync-final-cookie-browsers-oct03.log`,
  `/tmp/neb-dual-auth-sync-final-errors-browsers-oct03.log` (both tabs assert no
  page errors; seven passed, one failed). Focus events and
  devices are automated/emulated; physical-device behavior and a real deployed
  cookie domain remain outside this evidence.
- Section 58's last unchecked bullet now has repository/browser evidence.
  Predeployment counts become 56 verified / 42 partial / six N/A / one
  deployment-only. Cookie domain/target HTTPS and the remaining native-device/
  form/control/API/default/transaction/joined/load/operations items remain open
  in their respective sections. New logout-event source requires its own CI.

### 2026-10-03 — Disabled feedback assets: correction in progress

- The stricter missed-logout browser run found rejected Agentation/HMR chunk
  loads in the second profile tab before logout. The logout fix is committed
  locally as `e4347a5` but has not been pushed; its complete gate is pending.
- A new account-route regression reproduced an Agentation chunk request even
  though QA and CI set `AGENTATION_ENABLED=false`. A conditional server import
  did not remove that request. Moving the tool to a dynamically loaded client
  wrapper passed the focused Chromium asset/page-error regression (one case).
  Logs: `/tmp/neb-feedback-assets-baseline-oct03.log`,
  `/tmp/neb-feedback-assets-fixed-oct03.log`,
  `/tmp/neb-feedback-assets-client-lazy-oct03.log`.
- All four browser modes with both logout cases and the new asset case, frontend
  checks and the subsequent source CI still need to pass. No overall browser
  error or final-source release success is claimed from the focused result.


### 2026-10-08 — session restoration and profile/account forms

- The complete continuation attachment is preserved verbatim in
  `production-readiness-continuation-request-2026-10-08.md`; its SHA-256 is
  `965004fb008a7a930c8f4fa34540cd4c113f1a74654fb0e8dd7438c18c2eefe7`.
  The original 105-section/1,142-item prompt remains unchanged with its recorded
  SHA-256. Preservation commit: `92c480a`.
- Disabled Agentation is isolated behind a client dynamic import with SSR off
  and the existing development-only server gate. Enabled development was
  separately exercised on `/support`: toolbar v3.0.2 visible, two tool chunks
  returned 200, zero browser console errors/warnings. That temporary server and
  browser were stopped. Disabled asset checks pass in all four engine modes.
- Independent security/correctness review found missing initial session
  baselines, account changes on mount, and persisted-page restoration. A
  request-cached server session lookup now passes only identity/logout-event
  metadata to the header. Successful child lookups can seed an unknown baseline;
  stale/aborted child responses cannot replace a newer successful observation.
  Known-user-to-guest transitions invalidate child authentication without
  treating ordinary expiry as explicit logout. Known account A-to-B changes on
  mount invalidate stale children and refresh through the existing safe route.
  Persisted `pageshow` revalidates even without focus; unchanged/historical
  logout markers do not purge recovery again. Focused units include lookup
  failure, stale observations, expiry, initial account changes and listener
  cleanup. Independent final correctness/coverage review found no further
  actionable defects within this packet; no production credentials are passed
  to the new shared observation event.
- Feed reads now abort on pagehide and restart the current page on persisted
  pageshow, including after an SSR initial result. Five regressions cover
  cancellation, restoration, pagination, SSR skip and cleanup. An earlier
  desktop-WebKit failure was a Fetch API page error for a departing Discover
  read before logout; no backend CORS rejection was established. The lifecycle
  change and the passing integrated packet do not prove that error's root cause.
- Profile submission snapshots actual FormData, including silently filled DOM
  values. Username blur captures the whole form before rerendering; failed
  validation retains these values for retry. Bio's visible/native limit now
  matches the backend's 500 characters. Pending account actions disable
  credential fields and show/hide controls. Rejected-field focus runs after
  reenabling, deletion maps its password validation beside the correct field,
  and password minimum length has a visible hint. Scoped units and real-stack
  browser journeys verify pending guards, one write, retained values/focus,
  silent profile values, retry persistence, multiline/Unicode/emoji/symbols,
  500-character bio and no overflow at 320/1710 px. Deletion uses a generated
  wrong password and cancellation, not successful deletion of a shared fixture.
- Final Node 22.23.1 container frontend lint/types and **352 tests / 38 files**
  pass, as does format. Backend test settings must explicitly override the
  development container: `DJANGO_SETTINGS_MODULE=config.settings.test`,
  `USE_S3=false`. With those settings **247 tests pass / one infrastructure-only
  Nginx skip**; Ruff/format (170 files), mypy (76 source files), and migration
  drift checks pass. Logs: `/tmp/neb-frontend-corrected-check-oct08.log`,
  `/tmp/neb-frontend-format-oct08.log`,
  `/tmp/neb-backend-tests-correct-env-oct08.log`,
  `/tmp/neb-backend-mypy-oct08.log`.
- Strict final browser packet: **36/36 pass, retries zero**, Chromium, mobile
  WebKit, Firefox and desktop WebKit. Each engine runs disabled feedback assets,
  missed explicit logout before/after same-account re-login through focus and
  simulated persisted pageshow, silent profile/rejection/retry, and three
  pending account forms. Both tabs retain unfiltered page-error assertions.
  Email rejection is a normalized mocked 400 to avoid consuming the fixture's
  three/hour real email quota; password/deletion reject through the real backend.
  These cases establish simulated lifecycle and DOM-fill behavior, not actual
  native BFCache restoration, physical devices, autofill/password managers or
  every form/control. Log: `/tmp/neb-session-profile-corrected-browser-oct08.log`.
  Config: `frontend/.playwright-cli/logout-browser.config.ts`; failures from
  earlier packets are retained under `.playwright-cli/artifacts`.
- Optimized build passes. A configured production build/start with
  `API_BASE_URL=http://localhost:18080/api/v1` and `AGENTATION_ENABLED=true`
  passes two Chromium profile/account-route walks at 320/1710 px: HTML 200,
  private/no-store, no overflow, no Agentation requests/toolbar, no console
  errors/warnings/page errors, no failed required requests/assets. The probe
  supplies the existing QA trusted Origin because its frontend uses a separate
  local port; it does not verify target-origin cookie/CSRF configuration. Next
  navigation cancels background requests carrying `next-router-prefetch: 1`;
  every captured cancellation is explicitly asserted as that prefetch with
  `net::ERR_ABORTED`, and all are retained in the log. Original traces also show
  their HTTP 200 responses; none is a suppressed browser exception. Logs:
  `/tmp/neb-production-configured-build-oct08.log`,
  `/tmp/neb-production-configured-start-oct08.log`,
  `/tmp/neb-production-final-browser-tests-oct08.log`.
- Unsuccessful runs are not passing evidence: the first backend run inherited
  development S3 and had four failures; initial frontend checks found six
  strict test-code TypeScript errors, all corrected; the first 36-browser packet
  had four malformed mocked-validation failures and one correct email quota
  rejection (31 passes). Failed bootstrap-browser variants coupled request order
  to StrictMode, so they were removed in favor of deterministic unit coverage.
  An earlier 20-case packet contained that removed variant and is not the final
  current-source packet. The first production start used a build-time default
  proxy at unavailable port 8000 and generated API 500s; it was rebuilt with the
  QA API. A CLI browser session closed during a probe. The first strict network
  probe failed solely on the explicitly traced Next prefetch cancellations;
  the final probe verifies their headers/error types rather than treating them
  as broken required assets. No app throttles, browser errors or retries were
  relaxed to pass. Earlier logs remain in `/tmp/neb-*-oct08.log` and artifacts.
- All checklist/tracker source-integrity checks pass. Counts remain **56 verified,
  42 partial, six N/A, one deployment-only; 752 checked / 390 unchecked**.
  Sections 4/5/7/8 still need the remaining form/control matrix. Sitemap scale,
  model defaults/transaction fault coverage, API/network/load measurements,
  native zoom/contrast, mixed versions/rollback and real operator/provider/device
  evidence remain open. This source still requires its own exact-SHA CI; the last
  green `1a671eb` gate cannot be reused for it.


### 2026-10-08 — exact-source CI dependency gate correction

- Session/form source `62386140d2a3bbee519e188441797ba0472d8176` was pushed.
  [CI 37697147428](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37697147428)
  failed frontend quality at production npm audit; backend/foundation/secret jobs
  passed and downstream browser/image jobs did not run. This is a failed gate.
- The reviewed [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
  was updated on October 5 and identifies 1.2.2 as patched. The lock pinned 1.2.1
  through Next's PostCSS and development tools. Only that resolved package is
  changed to 1.2.2 within its existing semver constraints; package.json, direct
  dependencies and audit thresholds remain unchanged. Lock-only production
  audit now reports zero vulnerabilities. The complete development audit still
  reports six high-severity dependency findings and is being assessed separately;
  no claim that the entire dependency tree has zero findings is made.
- Logs: `/tmp/neb-ci-6238614-frontend-job-oct08.log`,
  `/tmp/neb-source-map-lock-update-oct08.log`,
  `/tmp/neb-source-map-production-audit-oct08.log`,
  `/tmp/neb-all-dependency-audit-oct08.json`. Fresh install/build/test and the new
  source CI remain required. Current workers' subsequent changes are not included
  in this dependency-only correction.

## 2026-10-08 — exact-source gate and next local packet

- Commit `c1fc2d7772ce697cb0dcccc528da4ab126040223` passed all nine jobs in
  [CI 37697846802](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37697846802),
  including browser smoke, full-stack flows, both image jobs and the release
  gate. This is evidence for that commit only; the next packet remains dirty.
- Original prompt and continuation request hashes are unchanged:
  `7b920f477e1087c2fe456f7bdbafef11e00e7be8ca17bc8ec99f180c274b65d9` and
  `965004fb008a7a930c8f4fa34540cd4c113f1a74654fb0e8dd7438c18c2eefe7`.
- Profile SQL update now commits username/profile/language/avatar changes
  atomically. Fault tests cover failures before and after profile persistence.
  Default contracts cover scalar/JSON declarations, inherited user fields,
  factory independence, UUIDs, persisted values and timestamps. Publish and
  republish final-idempotency failures roll back their complete SQL graph;
  export callbacks are discarded on enclosing transaction rollback.
  Independent scoped review found no remaining defect in that packet. These
  results do not establish every application's transaction/recovery contract.
- Password reset/change takes a fresh row lock before token/password policy
  validation, commits credential/session/audit rows together, and prepares the
  replacement session before commit. Durable password-notice intent freezes
  its recipient and survives broker/SMTP failure. Focused PostgreSQL tests
  include real concurrent reset/change winners. Independent security review
  passes. Locmem delivery and patched SMTP failures are local evidence;
  actual broker/Beat/provider and crash-after-SMTP-acceptance remain distinct.
- Backend integrated run: **297 passed, one infrastructure-only skip**;
  `mypy .`: **76 sources pass**. The first integrated run had two genuine
  failures: a legacy password-notice mock path and empty sitemap-part handling.
  The mock was updated to the changed service path; DRF query validation now
  distinguishes omitted legacy input from a present empty part and returns
  400 for the latter. Both fixes retain their assertions.
  Logs: `/tmp/neb-backend-integrated-final-oct08.log`,
  `/tmp/neb-backend-all-source-mypy-oct08.log`.
- Language, privacy and notification controls retain pending/dirty state,
  report scoped progress, roll back rejected writes and permit real retry.
  Their first integrated TypeScript run rejected unsupported Testing Library
  role `exact` options; those options were removed without weakening named
  role assertions. Frontend before SSR integration: **390 tests / 39 files**,
  lint/types/format pass. Logs:
  `/tmp/neb-frontend-next-packet-final-check-oct08.log`,
  `/tmp/neb-frontend-next-packet-final-format-oct08.log`.
- New four-engine live preference packet first passed **15/16**, retries zero.
  Chromium's real all-language retry got gateway 502 at 22:52:44 UTC. Backend
  source changed at 22:52:43 UTC; proxy records show several upstream failures
  at that time. Runserver autoreload interference is strongly correlated, but
  there is no process-log proof. The trace and failure logs are preserved at
  `frontend/.playwright-cli/artifacts/preference-controls`,
  `/tmp/neb-preference-controls-browser-oct08.log` and
  `/tmp/neb-preference-controls-upstream-failure-oct08.log`.
  The all-language reload assertion also now waits for a loaded, enabled
  chooser before counting zero selected controls. With stable app sources the
  separately recorded packet passed **16/16**, retries zero, retaining full
  page-error assertions and real retry writes:
  `/tmp/neb-preference-controls-stable-browser-oct08.log`.
  Mocked 503 responses are deliberate failure injection, not a claim that all
  browser resource responses were successful.
- Scalable sitemap index uses occupied integer PK buckets and anonymous
  projected parts, with no one-hour visibility cache. PostgreSQL regression
  covers 10,002 boards, sparse huge IDs, immediate public/private/archive
  changes, capacity and query bounds. Frontend XML verifies canonical origins,
  escaping, invalid parts, staging emptiness and upstream failure. Independent
  review passes. This does not measure scaled SQL latency or target crawl load.
  New backend must precede new frontend; mixed-version controls are documented.
- SSR previously forwarded only cookies, aggregating guest throttle quotas
  under the frontend replica. Server-only `SSR_TRUST_PROXY_CLIENT_IP=true`
  now accepts one valid IPv4/IPv6 address from normalized private ingress.
  Direct Next defaults off; chains and zone IDs are rejected. Sitemap calls
  remain anonymous. Independent security review passes within the declared
  private topology. New PostgreSQL quota tests: **4 pass**; integrated frontend
  lint/types and **412 tests / 40 files** pass. Logs:
  `/tmp/neb-ssr-throttle-postgres-oct08.log`,
  `/tmp/neb-frontend-ssr-integrated-check-oct08.log`.
  QA frontend was recreated alone with explicit feedback-off/QA-origin flags,
  and Nginx reloaded its upstream resolution. Target application reachability,
  controlled-edge trust and IPv4/IPv6 forged-header replacement still need
  actual ingress evidence; syntax validation alone cannot prove that trust.
- Fresh Node 22 and host installs succeed. Lock-only brace-expansion patch
  versions are 1.1.21, 2.1.7 and 5.0.12, following the
  [primary advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
  Production npm audit reports zero findings. Full development audit retains
  five affected package nodes from one
  [braces recursion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
  which lists no patched version; registry latest is 3.0.3. Installed dependency
  tracing finds only the development Next ESLint plugin's fast-glob chain.
  Its root-directory glob comes from trusted ESLint settings; this project
  supplies no rootDir glob and defaults to context.cwd. No application-request
  input path or production package is found in that scoped trace. This is a
  scoped exposure assessment, not removal of the advisory. Do not force the
  audit-suggested downgrade to eslint-config-next 14.2.35.
  Logs: `/tmp/neb-frontend-fresh-production-audit-oct08.log`,
  `/tmp/neb-host-final-source-install-oct08.log`.
- Optimized build/start with the QA backend and illustrative canonical origin
  `https://bingo.example.com` passed. A local XML walk returned **2 parts / 10
  URLs / 1,808 bytes**, validated canonical origins, XML roots, no-store headers
  and limits, and received 400 for empty/negative/leading-zero/repeated parts.
  It did not contact or establish ownership/TLS of that illustrative domain.
  The temporary server was stopped. Logs:
  `/tmp/neb-final-packet-configured-optimized-build-oct08.log`,
  `/tmp/neb-final-packet-configured-optimized-start-oct08.log`;
  index snapshot `/tmp/neb-optimized-sitemap-index-oct08.xml`.
- Next defects verified statically: non-password verification/email-change/
  deletion callbacks can lose required email and return 500 after SQL commit.
  Export jobs already have a durable recovery scanner but their callbacks also
  misreport 500, and one failed recovery publish can interrupt a sweep.
  Fixes are in progress; no passing tests or completion claim for those fixes
  is made here. A verification delivery column needs a persistent SQL default
  for old writers; new worker tasks require a worker-first rollout before new
  web producers. Final integrated checks and exact-source CI remain required.

## 2026-10-08 — durable mail/export, locked step-up and final local packet

- The callback defects described above are fixed. Verification rows contain
  recoverable delivery intent and a versioned HMAC-token contract; only the
  token digest is persisted. Rotation fallback keys reconstruct existing links
  without changing expiry/cooldown. Email-change notices freeze both recipients;
  deletion warning intent is cancelled with its matching deletion request.
  Security review covers token reconstruction, cancellation ordering, privacy
  cleanup and migration compatibility. SMTP acceptance followed by a DB failure
  can still duplicate a message: delivery is at least once.
- Migration `accounts.0006_emailverification_delivery` has a persistent SQL
  `{}` default. An actual old-writer INSERT omitting this column succeeds in
  PostgreSQL; legacy hash-only links remain valid but unreconstructible lost
  messages need explicit resend. Migration was applied on local QA and worker/
  Beat restarted. New mail/recovery tasks are registered by the real worker.
  Deploy migration, replace/drain workers, then new web producers and frontend;
  retain strong fallback keys for verification lifetime/recovery. Compose now
  forwards fallback keys and the configurable mail timeout to all three Python
  services; an explicit placeholder/7-second configuration probe passed.
- New recovery scanner bounds are ten verification rows and ten account events
  every five minutes; password notices have their separate 25-event bound.
  Delivery failures keep safe error codes and exponential next-attempt times.
  Focused PostgreSQL mail/credential/default/account packet: **105 pass**.
  Log: `/tmp/neb-account-delivery-postgres-focused-oct08.log`.
- An isolated Django process used a genuinely closed loopback Redis port:
  registration returned **202**, the real publish raised OperationalError, and
  the verification row remained pending. Manually republishing its ID through
  the normal broker reached the real worker: the same row became sent and
  Mailpit contained one matching message. This verifies real local transport
  recovery; it does not prove production SMTP or unattended Beat timing.
  The first cleanup guard incorrectly expected the unverified account's final
  username (stored in pending verification until confirmation); delivery checks
  had passed but that probe exited nonzero. A separate corrected guard matched
  user ID/email/pending username and removed only the synthetic account.
  Logs: `/tmp/neb-account-real-broker-failure-oct08.log`,
  `/tmp/neb-account-real-worker-repair-oct08.log`,
  `/tmp/neb-account-broker-probe-cleanup-oct08.log`.
- Export callbacks catch operational broker failure, retain the owned job and
  HTTP 202, and emit projected task/job/pending logs. Recovery scans at most 100
  jobs of each type: queued/uploaded after five minutes; processing only after
  hard-task timeout plus 60 seconds. A failed publish conditionally restores the
  previous timestamp without overwriting a worker's newer state and does not
  interrupt other jobs. Per-user locking serializes first account-export
  creation. Focused real PostgreSQL fault/concurrency packet: **24 pass**;
  independent correctness review passes. Log:
  `/tmp/neb-exports-recovery-concurrency-postgres-oct08.log`.
- Security review found that email-change/deletion serializers checked a cached
  user before the mutation's fresh lock. A concurrent reset could make that
  accepted password stale. Services now recheck the submitted password on the
  locked row before mutations or idempotent deletion return; serializers and
  step-up services use no-setter hash verification. Nine PostgreSQL regressions
  include observed blocking on a genuinely uncommitted reset and successful
  legacy hashes preserving the stored/session auth hash. Deletion still revokes
  sessions. Final scoped independent security review passes.
- Draft/revision GET lists now return pagination envelopes (24 default, 100
  maximum) with deterministic fixed-data ordering and existing access rules.
  Related rows are hydrated only after pagination. OpenAPI documents actual
  required idempotency headers and replay/conflict statuses; generated frontend
  contracts match. Five DB pagination and seven schema cases plus the integrated
  suite pass; independent review passes. No repository frontend GET caller was
  found; external array consumers must migrate. Offset pagination does not
  promise a snapshot while concurrent edits change ordering.
- Final integrated backend: **363 passed, one infrastructure-only skip**;
  Ruff/format, mypy (**77 sources**), migration drift and exact OpenAPI comparison
  pass. Final integrated frontend Node 22: **415 tests / 40 files**, lint/types/
  format pass; generated API types regenerated successfully. Logs:
  `/tmp/neb-post-stepup-all-postgres-oct08.log`,
  `/tmp/neb-post-stepup-all-ruff-oct08.log`,
  `/tmp/neb-post-stepup-all-python-format-oct08.log`,
  `/tmp/neb-post-stepup-all-mypy-oct08.log`,
  `/tmp/neb-frontend-post-contract-final-check-oct08.log`,
  `/tmp/neb-post-contract-final-frontend-format-oct08.log`.
- Session sign-out and deletion cancellation show scoped pending status,
  disable duplicate activation, retain unrelated credential drafts, and retry
  after a held 503. The cancellation journey registers/verifies a separate
  account through real Mailpit, schedules deletion, signs in during the grace
  period, cancels and verifies persisted cancellation. Combined preference/
  sign-out/cancellation packet: **24/24**, Chromium, mobile WebKit, Firefox and
  desktop WebKit, **retries zero**, full page-error assertions, 320/1710 overflow
  checks and real successful retry writes. Log:
  `/tmp/neb-final-account-preferences-browser-oct08.log`.
  Native autofill, BFCache, OS file chooser and physical virtual keyboards remain
  separate unverified capabilities.
- Disposable scale audit verified **10,002 boards / 10,001 public / one private /
  20,002 revisions / 180,000 cells**, two occupied sitemap parts, zero public
  omissions and private exclusion. Each API response used one SELECT. Index:
  19 JSON bytes, 5.849 ms view/render, 3.808 ms EXPLAIN execution. Part 0: 9,999
  boards, 1,219,909 JSON bytes, 194.945 ms view/render, 8.745 ms SQL using PK index
  plus memoized author lookup. Part 1: two boards, 275 bytes, 1.971 ms view/render,
  0.066 ms SQL. Temporary database cleanup succeeded; source data unchanged.
  This is one in-process sample, excluding middleware/network/Next/proxy,
  concurrency, cold-cache guarantees and production capacity. Log:
  `/tmp/neb-sitemap-scaled-database-audit-oct08.log`.
- Final configured optimized build/start passes; the new anonymous sitemap
  walker returns **two parts / ten URLs / 1,808 bytes**. Independent review found
  three false-pass checks in its first draft (missing static child, encoded part
  alias and substring cache directive). They are corrected; valid mocked data
  and 12 malformed cases were independently checked. The real walk enforces
  canonical index URLs/order/bounds, static route set, XML structure, no-store,
  document byte/entry limits and per-document duplicate policy. Author URLs can
  repeat across separate parts by design. Canonical `https://bingo.example.com`
  is illustrative; no ownership/TLS/provider claim. Temporary server stopped.
  Logs: `/tmp/neb-final-reviewed-optimized-build-oct08.log`,
  `/tmp/neb-final-reviewed-optimized-start-oct08.log`,
  `/tmp/neb-reviewed-sitemap-walker-oct08.log`.
- The walker additionally rejects DTD/entity declarations before expansion;
  UTF-8 and UTF-16 adversarial payload checks pass. Its final real-server rerun
  returns the same two parts / ten URLs / 1,808 bytes. Both infrastructure Python
  scripts pass scoped Ruff checks; generated scale-fixture passwords are
  explicitly unusable. Logs: `/tmp/neb-sitemap-xml-hardening-check-oct08.log`,
  `/tmp/neb-reviewed-sitemap-walker-xmlguard-oct08.log`.
- Section 42's defaults item is now checked from persisted/factory/timestamp/
  SQL evidence; total **753 checked / 389 unchecked**, section verdicts unchanged
  (**56 verified / 42 partial / six N/A / one deployment-only**). Broader
  transaction mapping, form/control coverage and operations/target requirements
  remain open. The current dirty packet still requires its own commit and all
  nine exact-source CI jobs; no production-readiness or deployment claim.

## 2026-10-08 — next exact-source gate and newly published dependency findings

- The reviewed packet is pushed as
  `d4dd0b7a16bfbb5f02d7d9a266a9c686a74f5fd2`.
  [CI 37703857269](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37703857269)
  passed backend, foundation and committed-history secret scan. Frontend stopped
  at production npm audit; dependent browser/image jobs were skipped and the
  release gate failed. This is not a passing release artifact.
- The registry audit now reports Next.js 16.0.0–16.3.7 affected by six
  maintainer advisories, with one high-severity affected production package:
  [draft-mode cache leak](https://github.com/advisories/GHSA-3w37-wq28-93x7),
  [SSG/ISR cache poisoning](https://github.com/advisories/GHSA-4jqv-mc3x-m676),
  [development MCP disclosure](https://github.com/advisories/GHSA-39w2-rjm5-chcv),
  [metadata route disclosure](https://github.com/advisories/GHSA-f87g-xv8r-7p7x),
  [SSG/ISR content substitution](https://github.com/advisories/GHSA-mcj8-r9mp-w47p)
  and [image optimization SSRF](https://github.com/advisories/GHSA-cjq9-62q9-8jv4).
  A fresh local production audit reproduces the finding. Earlier zero-finding
  results remain valid observations of their audit snapshot, not current safety.
  Official patched-version verification and the smallest coherent dependency
  update are in progress; no advisory or gate is suppressed.
  Logs: `/tmp/neb-ci-d4dd0b7-failures-oct08.log`,
  `/tmp/neb-production-audit-after-d4dd0b7-oct08.json`.


## 2026-10-08 — dependency patch and current auth/editor evidence

- Official [Next.js 16.3.8 release](https://github.com/vercel/next.js/releases/tag/v16.3.8)
  and [maintainer comparison](https://github.com/vercel/next.js/compare/v16.3.7...v16.3.8)
  verify the patch. Matching registry metadata preserves Node/React/ESLint peers;
  the repository has no custom incremental cache handler. Only Next.js and its
  ESLint configuration/plugin/platform packages are updated to 16.3.8. Host and
  Node 22 clean installs pass; production npm audit reports zero findings.
  Logs: `/tmp/neb-next1638-host-install-oct08.log`,
  `/tmp/neb-next1638-node22-install-oct08.log`,
  `/tmp/neb-next1638-production-audit-oct08.json`.
- Token verification now offers explicit Retry for transient failures with its
  original token, pending status and synchronous duplicate protection. Current
  token/mode/lifetime ownership protects callbacks, success and URL stripping;
  stale resend completion was found and corrected by independent review.
  Image-only publication associates and focuses the required description;
  ordinary edits do not steal focus. Scoped reviews pass. Integrated Node 22
  lint/types and **454 tests / 40 files** pass; format passes. Logs:
  `/tmp/neb-next1638-forms-integrated-frontend-oct08.log`,
  `/tmp/neb-next1638-forms-frontend-format-oct08.log`.
- Initial strict new live packet stopped with **three passed, four failed, one
  interrupted and eight not run**. Test diagnoses include email-change 204
  expectation, native border select locator/key assumptions, a real default
  verification 429 shared across projects, and mobile inline text editing hiding
  the inspector after successful upload. Traces and failures are preserved;
  no error filters, retries or quota increases are added. Corrected Chromium
  token cases pass; editor/control and final four-engine results remain pending.
  Logs: `/tmp/neb-next1638-token-editor-browser-oct08.log`,
  `/tmp/neb-next1638-token-editor-chromium-oct08.log`.
- Seven independently reviewed request-size cases now pass. The initial run
  failed five assertions because error details are lists; exact list/message/code
  assertions are corrected without weakening state checks. Tests cover bounded
  parser reads without Content-Length, actual oversized PUTs, no state/storage/
  enqueue on rejection, normalized UTF-8 byte boundaries and preserved draft/
  version/ETag. Valid bounded fields remain below 512 KiB; the exact boundary
  test explicitly lowers that cap, while separate malformed bodies exceed the
  real cap. Actual deployed ingress enforcement remains separate. Logs:
  `/tmp/neb-request-size-regressions-oct08.log`,
  `/tmp/neb-request-size-regressions-corrected-oct08.log`.
- Independent section 82 mapping supports checking ten local contract bullets;
  **763 checked / 379 unchecked**, section verdict counts unchanged. Request-size
  recording awaits integration; actual provider timeout/load remains open.

- Final request-size integration: **370 PostgreSQL tests passed / one Nginx
  outside-image skip**; Ruff and format pass. Section 82 request-size is checked:
  total **764 checked / 378 unchecked**, section verdict counts unchanged. Logs:
  `/tmp/neb-next1638-request-size-all-postgres-oct08.log`,
  `/tmp/neb-request-size-final-ruff-oct08.log`,
  `/tmp/neb-request-size-final-python-format-oct08.log`.
- The native editor scenario exposed actual horizontal overflow at 320 px with
  one valid 40-character unbroken Cyrillic tag. The chip now wraps within its
  container and retains its nonshrinking remove button. Corrected native select
  typeahead, sliders and save/reload/overflow pass in Chromium. This was a real
  source defect after the harness corrections, not a filtered assertion. Logs:
  `/tmp/neb-next1638-editor-controls-chromium-oct08.log`,
  `/tmp/neb-next1638-editor-tagwrap-chromium-oct08.log`.
- The first Next.js 16.3.8 optimized start omitted `APP_ENVIRONMENT=production`;
  the strict sitemap walker correctly rejected the intentional empty noindex
  urlset instead of accepting it as a public index. That temporary server was
  stopped. A fresh explicitly configured production build/start is pending;
  no target/public hostname claim is made. Logs:
  `/tmp/neb-next1638-tagwrap-optimized-build-oct08.log`,
  `/tmp/neb-next1638-tagwrap-optimized-start-oct08.log`,
  `/tmp/neb-next1638-production-sitemap-walk-oct08.log`.

- Final Node 22 check/format on tag-wrap source: **454 tests / 40 files**, lint,
  types and Prettier pass. Independent root CSS/E2E review passes. Configured
  `APP_ENVIRONMENT=production` Next.js 16.3.8 optimized build/start passes and
  strict anonymous sitemap walk confirms **two parts / ten URLs / 1,808 bytes**.
  Illustrative canonical origin is not a public-deployment verification. Logs:
  `/tmp/neb-next1638-tagwrap-final-frontend-oct08.log`,
  `/tmp/neb-next1638-tagwrap-final-format-oct08.log`,
  `/tmp/neb-next1638-configured-optimized-build-oct08.log`,
  `/tmp/neb-next1638-configured-optimized-start-oct08.log`,
  `/tmp/neb-next1638-configured-production-sitemap-oct08.log`.
- A separate-project four-case Chromium run passes; mobile WebKit passes both
  token cases and native editor controls but fails the Unicode image journey:
  after leaving inline editing the visible mobile inspector correctly overlays
  the underlying Finish button. The scenario now closes the inspector through
  its normal button before continuing, without force click. Final projects are
  rerunning with normal fixture reset and zero retries. Prior mobile failure:
  `/tmp/neb-next1638-final-logout-mobile-webkit-oct08.log`.

- Reviewed projects now pass Chromium **4/4**, mobile WebKit **4/4**, and a
  separately paced Firefox **4/4**. The first Firefox run's consumed-token
  assertion received an actual **Nginx HTML 429**, distinct from the earlier DRF
  quota. The QA ingress has its existing 10 requests/minute auth zone and burst
  30 (matching the existing CI override); no setting was increased for this
  packet. Normal time between projects permits refill. Desktop WebKit is still
  pending. Logs: `/tmp/neb-next1638-reviewed-logout-chromium-oct08.log`,
  `/tmp/neb-next1638-reviewed-logout-mobile-webkit-oct08.log`,
  `/tmp/neb-next1638-reviewed-logout-firefox-oct08.log`,
  `/tmp/neb-next1638-paced-firefox-oct08.log`.
- Configured optimized production browser probe passes **2/2** at 320/1710 px
  for Explore→profile/account→Explore, with private/no-store HTML, no page or
  console errors, no bad responses or feedback assets. Canceled requests are
  asserted to be specifically aborted Next prefetch requests; actual failures
  are not ignored. Log: `/tmp/neb-next1638-production-routes-oct08.log`.
- A bounded section 36 inventory found an Explore metadata mismatch: only the
  first member of a repeated query parameter counted toward search-state
  noindex. An empty first member followed by a nonempty language could bypass
  that metadata policy. This is a local correction pending implementation;
  the initial SSR blank-language error is not described as successful filtering.
  Existing semantic-heading, clean-route and canonical evidence is being mapped.

- Desktop WebKit final four cases pass **4/4**; combined final scoped engine
  results are **16/16, retries zero**. Native formatting/range/select behavior,
  multilingual bounded input, persistence/reload, long-tag layout, real Mailpit
  token retry/reuse and image-description focus now have executed evidence.
  Log: `/tmp/neb-next1638-paced-webkit-oct08.log` plus prior three engine logs.
- Full-suite quota review found the new tests would add three anonymous token
  operations beyond the shared-IP default five/hour used by other journeys.
  A bounded test-only amendment attributes email-change setup verification to
  the player fixture and registration consumed-token checking to the author
  fixture; its first token-only registration confirmation remains anonymous.
  Application quotas and real backend requests stay intact. The amendment still
  requires a scoped browser run; its four-engine antecedent is preserved above.

- Explore repeated-query metadata now scans every value. Fifteen regressions
  exercise actual metadata generation for blank/base, scalar and repeated query
  state, and staging; the two repeated-value cases failed before the fix. Scoped
  twenty metadata cases pass; independent review passes. No API/UI normalization
  change is included. Integrated Node 22 **469 tests / 40 files**, lint/typecheck
  and format pass. Logs: `/tmp/neb-next1638-metadata-final-frontend-oct08.log`,
  `/tmp/neb-next1638-metadata-final-format-oct08.log`.
- A fresh configured production build and two real-browser public-head probes
  pass. Ten guest routes at 320/1710 px have a single first H1, no heading-level
  jumps, meaningful unique titles, nonempty descriptions, canonical identities,
  no overflow and no page errors: catalogs, three policy pages, support, public
  bingo/profile and immutable share. Search/page/repeated-language query state
  has query-free Explore canonical and noindex; uppercase username/UUID requests
  point to persisted canonical identities. Slash redirect is 308 and preserves
  search. The first probe incorrectly assumed Location was absolute; corrected
  parsing resolves a valid relative Location against the response URL. Logs:
  `/tmp/neb-next1638-metadata-optimized-build-oct08.log`,
  `/tmp/neb-next1638-public-metadata-oct08.log` (one pass / one harness failure),
  `/tmp/neb-next1638-public-metadata-reviewed-oct08.log` (**2/2**).
  The actual final sitemap walk again passes two parts / ten URLs / 1,808 bytes:
  `/tmp/neb-next1638-final-production-sitemap-oct08.log`.
- Section 36 semantic headings, meaningful URLs and local duplicate handling
  now have inspected and executed evidence. Named routes and username/public
  UUID identities intentionally preserve links across title edits; no slug
  rewrite is required. www/alternate-host and HTTP→HTTPS target verification stay
  open. Total **767 checked / 375 unchecked**, section verdict counts unchanged.
- Final quota-isolated token amendment passes Chromium **2/2** with an anonymous
  first registration retry and separate fixture-owned setup/reuse operations;
  remaining engine amendment checks are running. Log:
  `/tmp/neb-next1638-final-token-actors-chromium-oct08.log`.

- The final fixture-owned setup/reuse variant passes **eight token cases** across
  Chromium, mobile WebKit, Firefox and desktop WebKit, retries zero. Anonymous
  first registration confirmation, original token/body checks, held real retry,
  consumed-token rejection and recovery actions remain intact. Logs:
  `/tmp/neb-next1638-final-token-actors-chromium-oct08.log`,
  `/tmp/neb-next1638-final-token-actors-logout-mobile-webkit-oct08.log`,
  `/tmp/neb-next1638-final-token-actors-logout-firefox-oct08.log`,
  `/tmp/neb-next1638-final-token-actors-logout-webkit-oct08.log`.
- Bounded section 42 mapping found a high-confidence source defect in both
  follow POST handlers: Follow is committed before notification and interaction
  writes, with no encompassing transaction and no ATOMIC_REQUESTS setting.
  A late write failure can leave Follow persisted; created=False on retry then
  skips the missing records. The existing successful/uniqueness tests do not
  prove late-write rollback. Fault tests and a bounded fix are now assigned;
  executed reproduction is pending. The transactions checkbox stays open.
  Separate missing assertions are moderation's final history-write rollback
  and sharing's final idempotency-write rollback; their atomic source alone is
  not reported as executed proof. Existing mapped profile/publication/credential/
  email-intent/export rollback proofs remain valid.

- Final metadata-source optimized profile/account probe passes **2/2** at
  320/1710 px with the same explicit console/page/request assertions. Temporary
  optimized server was stopped. Log:
  `/tmp/neb-next1638-final-production-routes-oct08.log`.
- Initial follow fault test run failed all six cases at authentication HTTP 401;
  its unverified fixture never reached the handlers. That result is a harness
  failure, not atomicity reproduction. The writer corrected the tests to use
  verified actors; all actual SQL/failure/rollback/retry assertions remain.
  Corrected baseline reproduction is pending. Log:
  `/tmp/neb-follow-transaction-baseline-oct08.log`.

- Corrected follow baseline actually reaches both routes: **four SQL-fault cases
  fail with Follow wrongly retained / two permission cases pass**. PostgreSQL
  NOT NULL failures are injected at notification and interaction-event writes;
  this reproduces the source defect. The minimal fix adds an atomic boundary to
  each POST handler; inputs, access and statuses remain unchanged. Its six cases
  now pass, proving graph rollback, complete retry and cross-route deduplication.
  Logs: `/tmp/neb-follow-transaction-corrected-baseline-oct08.log`,
  `/tmp/neb-follow-transaction-fixed-oct08.log`.
  Independent review, integrated checks and affected strict browser cases are
  still pending; moderation/share graph rollback assertions are being written.

- Independent follow transaction review passes: the method transaction contains
  DB-only relationship/notification/event writes, wraps before DRF error
  handling, preserves schema metadata, and retains unique-constraint/get_or_create
  concurrent deduplication. OpenAPI validates and exactly matches its checked-in
  file after the decorator change; Ruff passes. Affected strict browser packet
  first passed nine cases and failed three later core social cases because the
  first engine's like remained in the shared fixture. The failing later pages
  correctly show Liked rather than the test's initial Like expectation. The
  normal single-engine CI core is unchanged; separate-engine fixture resets are
  now running the same twelve checks without altering assertions/retries. Log:
  `/tmp/neb-next1638-follow-social-oct08.log`.

- Separate normal-fixture project runs pass **12/12** affected follow/social
  cases in Chromium, mobile WebKit, Firefox and desktop WebKit, retries zero.
  They include real follow completion after departure, delayed failure cleanup,
  and like/comment/reply/follow/report success; no source or assertion changes
  were needed for the shared-fixture failure. Logs:
  `/tmp/neb-next1638-follow-reviewed-logout-chromium-oct08.log`,
  `/tmp/neb-next1638-follow-reviewed-logout-mobile-webkit-oct08.log`,
  `/tmp/neb-next1638-follow-reviewed-logout-firefox-oct08.log`,
  `/tmp/neb-next1638-follow-reviewed-logout-webkit-oct08.log`.
- Six new late business-graph SQL cases pass. Board-hide and account-suspension
  tests capture real content/report/audit/session mutations before a final
  history NOT NULL failure, compare persisted graph restoration, recover warmed
  cached sessions from restored durable rows, discard failed callbacks and retry
  coherently. Four share cases cover guest/authenticated actors and new/expired
  keys: share/event/counter mutations occur before final idempotency failure;
  rollback restores the prior graph and expired key; retry/replay retains one
  coherent result and existing publication/progress/shares/events. Independent
  coverage review passes. Log: `/tmp/neb-business-graph-rollback-oct08.log`.
  These prove SQL/callback rollback, not real broker delivery or process failure
  after commit. Eager cache eviction is acceptable; valid restored sessions must
  load again, rather than preserving raw cache bytes.
- Full mypy passes **77 source files**; OpenAPI generation validates and matches
  exactly after follow method decoration. Full Ruff/format and migration drift
  checks pass; final integrated backend execution is still running. Logs:
  `/tmp/neb-follow-all-final-mypy-oct08.log`,
  `/tmp/neb-follow-schema-validation-oct08.log`,
  `/tmp/neb-follow-openapi-compare-oct08.log`,
  `/tmp/neb-final-follow-graphs-ruff-oct08.log`,
  `/tmp/neb-final-follow-graphs-format-oct08.log`,
  `/tmp/neb-final-follow-migration-drift-oct08.log`.

- Final integrated backend on all new transaction/request-size cases: **382
  passed / one infrastructure-only skip**, 51.33 s. No remaining failed test in
  this run. Important local transaction boundaries now have mapped multiwrite,
  fault/retry, callback and concurrency evidence; §42 transactions is checked.
  Total **768 checked / 374 unchecked**, section verdicts remain **56 verified /
  42 partial / six N/A / one deployment-only**. Log:
  `/tmp/neb-final-follow-graphs-postgres-oct08.log`.
- The completed local packet has 469 frontend tests / 40 files, Node 22 lint/
  types/format, 382 PostgreSQL tests plus one infrastructure skip, Ruff/format,
  mypy 77 sources, migration drift and exact OpenAPI comparison, independent
  reviews, strict token/editor/follow engine packets and configured optimized
  production metadata/profile/sitemap probes. Each probe's scope and antecedent
  failures remain recorded above. The next commit still requires all nine
  exact-source CI jobs; other form/native-device/operations/target items remain
  open. This is not a production-readiness or deployment claim.


### 2026-10-08 — exact-source CI and corrected browser expectations

- The complete original prompt and verbatim continuation request remain unchanged;
  SHA-256 checks match their registered values.
- Packet `a3e1c00e945855df82be25191207610ef861e148` was pushed on the existing
  branch and draft PR #18. [CI 37707547894](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37707547894)
  **failed**: backend/frontend quality, foundation, history secrets and both
  production images passed; browser smoke and full-stack failed, so Release gate
  failed. Smoke: 199 pass / one fail / 12 intentional skips. Full-stack: 110
  pass / one fail / five not run. Logs/report downloads are retained:
  `/tmp/neb-a3-ci-all-failed-oct08.log`, `/tmp/neb-a3-ci-playwright-report`,
  `/tmp/neb-a3-ci-live-playwright-report`.
- The smoke failure was reproduced at 320×800 touch WebKit, retries zero.
  The trace contains both the mounted inspector and focused inline textarea for
  Cell 100. Intentional mobile CSS hides the inspector while inline editing is
  active. The test now exits that editing mode through Escape, then verifies
  selection/text retention and unchanged inspector geometry/44 px close control.
  An ignored-copy proof passed four engines; the actual tracked test also passes
  **4/4**, retries zero: `/tmp/neb-ci-mobile-tracked-oct08.log`.
- The full-stack password test submitted an incorrect current password together
  with a weak replacement, but expected current-password validation first. The
  actual 400 contains only `details.new_password`: serializer field validation
  precedes service current-password checking. The corrected test uses a valid
  replacement for the wrong-current case, then a correct current value for the
  weak-replacement case. It asserts each actual response field, focus,
  aria-invalid, inline message and all three retained values. **4/4** engines
  pass with zero retries. Logs: `/tmp/neb-ci-password-validation-corrected-oct08.log`,
  `/tmp/neb-ci-password-validation-logout-mobile-webkit-oct08.log`,
  `/tmp/neb-ci-password-validation-logout-firefox-oct08.log`,
  `/tmp/neb-ci-password-validation-logout-webkit-oct08.log`.
  Independent behavioral review passes. No product validation ordering, error
  filter, quota or retry setting was changed.
- Final current Node 22 frontend lint/types plus **470 tests / 40 files** pass;
  format passes. Logs: `/tmp/neb-aria-ci-amendment-final-frontend-oct08.log`,
  `/tmp/neb-aria-ci-amendment-final-format-oct08.log`. Backend application source
  is unchanged since the previous 382-pass/one-skip integration gate. The next
  committed source still needs all nine CI jobs; the failed a3 gate is retained.

### 2026-10-08 — ARIA, field labels and observed default UI contrast

- Independent read-only inventory covers 71 current product TSX files,
  255 ARIA/role sites in 33 files and 45 native-field template sites in 15 files.
  The [matrix](accessibility-verification-matrix.md) records associated labels,
  dynamic ID derivation and native-tooling limits. No placeholder-only name was
  found. The two form-label bullets are checked.
- The audit found two concrete mismatches: the play/shared grid allowed several
  selected cells without declaring multiple selection, and the active-filter
  wrapper used a name on an unnamed generic element. The grid now declares
  `aria-multiselectable=true`; the filters expose a named group. Existing marked
  names/pressed/read-only state and snapshot no-toggle behavior are retained.
  Eight board and four Explore component cases pass; independent review passes.
  The discretionary-ARIA bullet is checked after the scoped complete inventory
  and correction, without claiming a native screen-reader walkthrough.
- The final actual Chromium probe passes **2/2**, retries zero: five loaded
  states at 320/1710 px, full-severity Axe, no console warnings/errors or page
  errors, two selected cells/named filter group, default large-text/control
  foreground and visible-border ratios at least 3:1, computable range/native
  accents and a keyboard-modality focus-outline sample. Log:
  `/tmp/neb-ui-contrast-loaded-reviewed-oct08.log`. Native checkbox screenshot
  inspection and pixel measurement show its solid blue `(0,117,255)` versus
  white at **4.21:1**; `/tmp/neb-native-checkbox-colors-oct08.json`. The
  reasonable large-text/UI contrast bullet is checked with the limits recorded
  in the matrix; authored art, disabled controls, OS-native variants, group
  opacity/background images and all focus states are not certified.
- Initial probe failures remain recorded: Next developer-toolbar focus, an
  incorrect relative editing path, guessed account routes, and a linter rejection
  of temporary `any` types. The reviewed probe uses actual `/profile`, loaded
  account/preferences/session state, product controls, explicit types and native
  accent evidence. A first host pixel check lacked Pillow; the existing backend
  Pillow measured the saved screenshot instead, without editing the image.
- Native Chrome app access by bundle ID/name timed out. Documented shortcuts did
  not change the measured viewport; the extension screenshots omit chrome. Zoom
  was reset and only the diagnostic tab closed. Actual 200% zoom and light/dark
  favicon chrome remain unchecked; no viewport/device-scale proxy is called
  native zoom. Counts are now **772 checked / 370 unchecked**; section verdicts
  remain 56 verified / 42 partial / six N/A / one deployment-only.

### 2026-10-08 — Actual immutable mixed-backend and rollback rehearsal

- The read-only rollout mapper selected synthetic prior Git release
  `c1fc2d7772ce697cb0dcccc528da4ab126040223` and new
  `a3e1c00e945855df82be25191207610ef861e148`; D4→a3 alone would miss accounts
  migration 0006, task names, sitemap and envelope compatibility changes.
  Production backend images were built from exact Git archives with revision
  labels, without source mounts. Actual immutable IDs and staged snapshots are
  in the sanitized [report](artifacts/mixed-backend-rehearsal-2026-10-08.json).
- New `infra/scripts/rehearse-mixed-release.py` uses a fixed owned disposable
  Compose project, loopback web/Mailpit ports, private generated credentials,
  immutable image IDs and explicit original/new process transitions. Independent
  safety review finds no blocking isolation/secret/cleanup issue. Nine pure
  boundary regressions pass; the foundation CI job now runs them. Root Ruff
  lint/format pass with the project's 100-column setting. An initial root lint
  invocation accidentally used Ruff's 88-column default (72 line-length errors),
  then was corrected; a YAML-count assertion also confused eight definitions
  with nine matrix-expanded jobs. Parsed YAML and the actual existing job matrix
  are retained; neither failed check was presented as a pass.
- Actual root execution **passes** using provided locally built images. Old
  migrations then forward migration 0006 apply; old web is ready against the
  forward schema. Genuine CSRF rejection is 403; proper old registration is 202,
  account inactive, verification delivery uses SQL `{}`, Mailpit has no message,
  and the real stopped-worker queue contains the old two-argument task. The new
  worker delivers that job through Mailpit; old-web confirmation and login are
  200. New web then produces a one-argument ID-only task and pending HMAC
  intent; actual worker/mail/confirmation/login reach durable sent state.
- Rollback restores the recorded old web image while retaining the new worker
  and forward schema. Readiness, unchanged verification/account graph, existing
  old/new authenticated sessions and fresh logins pass; final inspected container
  image IDs match. Final stack is intentionally kept for the isolated frontend
  phase. No `nebqa` volumes/services/fixtures were touched. Logs:
  `/tmp/neb-rollout-backend-rehearsal-oct08.log`,
  `/tmp/neb-rollout-backend-old-build-oct08.log`,
  `/tmp/neb-rollout-backend-new-build-oct08.log`,
  `/tmp/neb-rollout-helper-tests-oct08.log`,
  `/tmp/neb-rollout-harness-ruff-oct08.log`,
  `/tmp/neb-rollout-harness-format-oct08.log`.
- Runbook now requires compatible new workers during old frontend/web rollback;
  old workers cannot consume new task names or recovery schedules. Worker rollback
  needs stopped new producers/schedules and explicit queue reconciliation.
  External clients of changed draft/revision array APIs must be inventoried and
  migrated. Independent review validates those constraints against code.
- This pass does not establish online migration safety, rollback of a pending
  verification, actual prior target deployment/configuration, registry retention,
  TLS/proxy/provider behavior or old-JS/new-HTML compatibility. Those remain
  open. Next phase builds/runs actual frontend images and retained tabs. The first
  old frontend build correctly rejected a missing support email; a separately
  configured build with illustrative HTTPS origin/support succeeds. The known
  old Next release is used only in isolated loopback rehearsal, not promoted.

### 2026-10-08 — Mixed frontend, stale tab and retained assets

- Exact Git-archive production images for c1fc2d7 and15632b6 passed opposite
  backend registration/Mailpit/login, draft/edit/publication and visibility:
  three Chromium cases per combination, retries zero. New frontend/old backend
  deliberately returns sitemap503/no-store/Retry-After300; backend-first rollout
  remains required. New/new sitemap walks two parts/ten URLs after readiness.
- The [mixed-frontend report](artifacts/mixed-frontend-rehearsal-2026-10-08.json)
  records immutable images, source-tree equivalence and one strict stale-tab
  browser case: two tabs in one context, offline Unicode recovery, frontend
  promotion, real RSC/document reload and durable editor version1→2, followed by
  old-web/frontend rollback with new worker/schema retained. Zero page errors or
  HTTP failures;135 RSC aborts and two deliberate offline failures remain. This
  does not prove unprefetched navigation, every lazy route or independent contexts.
- New append-only publisher exports only public Next assets from a stopped
  immutable image, verifies release metadata, rejects unsafe tar/path/file types,
  private/maps, conflicts and insufficient budget/free space, and privately
  inventories hashes. Thirteen boundary tests and independent scoped security
  review pass under the trusted image/sole publisher/trusted filesystem contract.
  Image metadata consistency is not source attestation.
- Actual Nginx1.30.3 serves all50 files (2,011,929 bytes;17 old-only/17 new-only)
  with matching hashes, successful immutable/security headers and gzip before
  promotion, afterward and after rollback. Empty archive falls back to active
  Next. Missing files/maps/private inventories/traversal remain400/404 without
  immutable error caching. Repeated new-image publication adds zero files.
  [Report](artifacts/frontend-assets-rehearsal-2026-10-08.json). Root13 unit tests,
  Compose overlay validation and Nginx syntax pass. Every target replica/CDN,
  supported tab age, rollback window, archive budget/replication and pruning
  policy still need operator configuration and actual target evidence.
- Section59 old-JS/new-HTML compatibility bullet is checked from these scoped
  mixed-image/fallback/retention results, with the real CDN requirement still open.
  Counters become773 checked/369 unchecked; section verdicts unchanged.

### 2026-10-08 — Optimized-image freshness observations

- [Sanitized report](artifacts/frontend-performance-2026-10-08.json): sixteen
  serial Chromium fresh/warm observations, four routes at390/1710px, exact15632b6
  production frontend image with old c1 backend/new worker/forward schema. Normal
  browser caching; no seeding/application changes during the probe. Fresh JS
  encoded transfer152,722–164,830 bytes; warm JS transfer zero. Gzipped documents
  are200/no-store. CLS is zero except editor0.000775 mobile/0.000457 wide.
- Two bounded editor session reads are present (header and editor). The probe
  exits1 for284 GET RSC ERR_ABORTED events; no page error, console warning/error,
  API/document failure, HTTP>=400 or probe-stage error occurred. Their cause and
  server cost remain unverified. These are measured local observations, not a
  clean unfiltered gate, target CDN proof or capacity test.

### 2026-10-08 — Auth and guest form packet, verification in progress

- Auth forms suppress obsolete callbacks/navigation/focus/errors on departure
  or request-scope handover. Successful departed login still updates global auth
  state. Reset consumes only its matching query token and preserves other query
  keys/hash. Guest nickname uses native required/max50, Enter, synchronous
  duplicate guard, scoped error/focus and pending controls; FormData captures
  actual submitted DOM values. Scoped groups pass34 each; integrated Node22
  frontend500 tests/40 files, lint/types pass. Backend app source unchanged.
- Final departed-auth browser packet16/16 and guest failure/retry/Enter packet4/4
  pass across Chromium, mobile WebKit, Firefox and desktop WebKit, retries zero.
  Earlier strict geometry assumptions and one WebKit lost-input run remain in
  logs; final tests assert meaningful form/height geometry, session initialization
  and retained filled values without retry increases.
- Pushed15632b6 CI37710181069 failed: seven jobs passed, full-stack115 pass/one
  fail. The token-email setup was anonymous after the earlier password test
  revoked the player fixture; the unchanged verification quota returned429.
  Uncommitted setup now proves moderator identity before isolated registration.
- First ordered117-case local run:94 pass/one guest alert selector failure/22 not
  run. Selector matched the Next route announcer; scoped to main, then4/4 target
  engines pass. Second run:113 pass/one reset-token reuse failure/three not run,
  /tmp/neb-auth-share-full-ordered-reviewed-oct08.log. Trace shows the second reset
  fill becoming empty before click and no POST. Source initializes/clears its
  request scope after controls render enabled; a gated initialization correction
  is in progress. Do not claim full-stack success or current release readiness.
- Prepared auth native-control and profile/export partial-composition scenarios
  still require execution. Exact new source CI and configured artifact remain
  pending.

### 2026-10-08 — Reset initialization and final local native/composition runs

- Reset password, visibility toggle and submit now remain disabled until the
  current UID/token request scope is initialized; a query identity change gates
  controls immediately before clearing old text. A layout-effect observer checks
  actual DOM availability before passive initialization, then current payload and
  same-link value preservation. Scoped35 tests and independent reviewer pass.
  Node22 full501 tests/40 files, lint/types pass:
  /tmp/neb-auth-share-reset-final-frontend-oct08.log.
- First composition trial exposed test defects: relative has selectors included
  the account ancestor, duplicate initial activity GET let the second real200
  bypass the held first request, and unroute raced fulfill. It ended two failed
  cases/one real Chromium reset pass; root interrupted the remaining run (130).
  Reviewed profile case settles initial Created then holds Drafts; handler
  completion is awaited before unroute, without ignored exceptions. Final12/12
  across four engines pass, retries zero: eight profile/export composition cases
  plus four real Mailpit reset/reuse journeys. Log:
  /tmp/neb-auth-reset-partial-composition-reviewed-browser-oct08.log.
- Bounded inventory reconciliation finds no remaining meaningful independent
  partial-read composition gap. Section4 partial bullet/section close locally;
  counters774 checked/368 unchecked,57 verified/41 partial/six N/A/one
  deployment-only. Surfaces with a single required read have no independent
  partial-data composition. Other native form/control requirements remain open.
- Native auth first run6 pass/10 fail: Username's wrapping accessible name
  includes its helper, and macOS WebKit skipped buttons under its default keyboard
  setting. Correct label lookup and app-only temporary keyboard navigation then
  pass14/16; two failures are WebKit login recovery-link traversal. Apple documents
  [Option-Tab for links](https://support.apple.com/en-gb/guide/safari/cpsh003/mac).
  Only that native link step uses it on Mac WebKit; input/button steps retain Tab
  and strict actual focus. Final16/16 passes, retries zero at320/1710, with native
  validation/min/max/pattern, Space visibility, Enter/duplicate prevention, held
  pending geometry and associated retained field errors. Log:
  /tmp/neb-auth-native-controls-reviewed-browser-oct08.log. Original app preference
  was absent and is confirmed restored. Physical iOS and Linux branch remain
  unproven by this local host observation; CI must execute the Linux branch.
- Independent bounded coverage review found no verified product bug/false-pass
  blocker; added two parameterized guest share old-success/error board-handover
  cases prove the old response cannot release the current pending lock or navigate.
  Player36 tests plus scoped lint/format pass; no app source change.
- Independent retention integration correctness/CI review passes. Root13 boundary
  tests, overlay config, live Nginx syntax, Ruff lint/format, parsed nine-job model
  and browser-source Gitleaks directory scan pass. Current full ordered119-case
  browser run is in progress; no full-suite or exact-source CI pass is claimed.

### 2026-10-08 — Final ordered auth/share packet before commit

- Final stable-source real-stack ordered suite passes **119/119**, retries zero,
  five existing live projects,5.8 minutes. The formerly failing reset/reuse and
  quota-isolated token-email setup pass in their actual order; all quotas and
  retry settings remain unchanged. Log /tmp/neb-auth-share-reset-full-ordered-oct08.log,
  artifacts frontend/.playwright-cli/artifacts/auth-share-reset-full-ordered-oct08.
- Node22 player36 (including both added board-handover regressions), final scoped
  ESLint/Prettier, diff check and complete checklist validator pass. Sanitized
  artifact-directory and browser-source Gitleaks scans find no leaks. The full501
  frontend gate predates only those two added tests; their Node22 scoped run
  passes afterward. Current source still requires all nine remote CI jobs and
  its configured optimized image; no deployment or merge is authorized.

### 2026-10-08 — b0d3e7e exact-source gate and immutable candidate

- Pushed `b0d3e7e3f3dfb0e695c6f93e0b174c822fa1be26` passes all nine jobs in
  [CI37715496152](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37715496152):
  backend383, frontend503/40 files, smoke231 with12 intentional skips,
  full-stack119, foundation, secrets, both production images and Release gate.
  The actual merge checkout `480beb3dc0c4706b64e1412bf995046d059cf4fd` and HEAD
  share tree `4ac79078c07e8f412f190c826d8c066d11a7d8ac`, verified through the
  GitHub commit API. Linux native-auth controls pass; physical devices remain open.
- Exact Git-archive configured frontend image builds and starts on isolated
  candidate18584, with no application mounts, matching embedded/runtime release
  and health200. Actual image ID:
  `sha256:6802c9b1a4ecb1abb8316112f8812694b5654ada4074998cb31e2b564f7a4529`.
  All68 optimized auth/native-control cases pass across four engines, retries
  zero. Mac app-only keyboard preference restored. Build/browser logs:
  /tmp/neb-frontend-b0d3e7e-production-build-oct08.log and
  /tmp/neb-frontend-b0d3e7e-auth-browser-oct08.log.
- Export adds11 files; archive now61 files/2,159,808 bytes. All61 pass actual
  hash/cache/security/gzip checks before candidate promotion, while active proxy
  frontend is still15632b6. First export used the build config digest rather
  than Docker image ID and failed before publication. First gzip probe selected
  a328-byte manifest below the1024-byte threshold; eligible-JS correction passes.
  Both failed diagnostics are retained. Sanitized exact-source report:
  [frontend candidate](artifacts/frontend-candidate-b0d3e7e-2026-10-08.json).
- New upload-progress working tree is separate from this passed source. Its
  integrated Node22 lint/types and560 tests/42 files pass; scoped security and
  failure-semantic reviews find no meaningful issue. Actual multi-MB byte pacing,
  storage CORS and cancellation runtime proof are still pending. No merge,
  public deployment or registry promotion occurred. Checklist774/368 unchanged.

### 2026-10-08 — Real upload byte progress and current-request ownership

- Browser transfers use a shared XHR helper with native byte progress and known/
  unknown totals. API upload preserves common CSRF/credentials/error/auth and
  deadline semantics; storage preserves signed fields/headers without API
  credentials. All terminal/cancel/timeout paths settle once and remove listeners.
  UI percentages are bounded and only measurable during transfer; preparation,
  processing and unknown totals remain indeterminate. Editor/avatar callbacks
  require current lifetime/controller and non-aborted signal; cancellation,
  replacement and completion clear progress.100% transferred never means ready.
- Node22 lint/types and560 tests/42 files pass. Transport77 and UI97 scoped cases
  plus independent security/failure/UI/behavioral reviews pass. Scoped all-source
  format, browser lint/types, diff check and browser-source Gitleaks scan pass.
- Initial ordinary four-engine gate9 pass/two fail/one not run: mobile inline
  mode hides inspector after successful attachment (explicit Escape corrected);
  desktop trace proves actual upload-intent429 from accumulated fixture traffic.
  Normally seeded projects then pass12/12, retries zero and unchanged limits.
- New valid1024×1024 random RGB PNG is3,147,780 bytes. Chromium CDP throttles
  actual MinIO multipart upload to256KiB/s. Intermediate native-driven UI
  percentages, cancellation before completion, exactly two intents/transfers and
  one completion, two actual CORS preflights and real storage204 are observed.
  Held real completionAPI proves visible indeterminate Processing and enabled
  Cancel, without ready attachment; release leads to decoded ready1024×1024 asset,
  autosaved draft and attachment after reload.320/1710 layouts and page errors pass.
- First ordered gate91 pass/one fail/28 not run: UI last sample99 rather than100.
  React can batch final progress with processing; corrected test verifies bounded
  monotonic intermediate values and real storage success instead of requiring
  each final event to render. Failure trace/log retained. Final ordered gate
  **120/120 passes**,6.1 minutes, retries zero, no skips or unexpected cases.
  /tmp/neb-upload-progress-full-ordered-reviewed-oct08.log; sanitized
  [numeric transfer evidence](artifacts/upload-progress-rehearsal-2026-10-08.json).
- Section5 practical-large-progress bullet closes locally:775 checked/367 open,
  section verdicts unchanged. Its other duplicate/layout bullets remain open.
  Physical devices/native chooser/clipboard/autofill and actual deployment remain
  separate. This packet still needs its own CI and configured optimized image.
- Separate next-packet profile-view unit changes add four cases (19/19 scoped),
  proving per-field/multiple-error association, focus, retained siblings and
  field-specific clearing. No profile implementation change; not included in the
  upload packet's560 tests or its commit. Root native profile browser proof remains.

### 2026-10-08 —620 CI result and optimized upload candidate

- Pushed62066472a28eebe46800e05fba9c59a785f3a726 completes
  [CI37718675809](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37718675809):
  seven jobs pass; smoke and Release fail. Backend383, frontend560/42 files and
  full-stack120 pass. Smoke231 pass/one WebKit reset silent-fill failure/12
  intentional skips. Actual merge111df2a0bca9dd481899c369267d5d090a1c4f1b
  shares HEAD tree33cc8da8e46b131ad4b623a24e3a2e40f431b319, verified with GitHub's
  commit API. Full retained job log /tmp/neb-ci-6206647-reviewed-oct08.log.
- Review of previous b0 job log corrects earlier incomplete smoke summaries:
  **231 passed, one flaky reset silent-fill case,12 skips**. All nine jobs were
  green, but that case needed existing retries. Its sanitized artifact now
  records the flaky result; no retry configuration or limit changed.
- Exact Git-archive configured620 production image builds and runs with no app
  mounts, matching release and health200. Actual image
  sha256:c4f6ce3460eb71419482c43b8cb7be43f1bf695d8499c02c89184c6a786dfe54.
  First browser draft POST403 came from omitted isolated loopback18584 origin;
  private Compose adds only that origin and retains CSRF. Corrected real3MiB
  API PUT/cancel/retry/processing/persistence case passes, retries zero; native
  percentages1→100, real202, no same-origin preflight. Separate shared QA proves
  real MinIO POST204/CORS. Four actual API Blob/CSRF/pending/ready/reload cases
  pass across Chromium/mobile WebKit/Firefox/desktop WebKit at320/1710. Their
  first4FAIL used an input label changed during pending; only the diagnostic
  locator was corrected. Logs and limits remain in
  [sanitized620 candidate report](artifacts/frontend-candidate-6206647-2026-10-08.json).

### 2026-10-08 — Native profile controls and silent-fill test readiness

- Profile implementation already has native constraints and ordered field-error
  behavior; no app source change. Profile unit packet19/19 passes on Node22,
  adding four cases for per-field/multiple-error focus, associated hints/errors,
  sibling-value retention and editing only the current field's error.
  /tmp/neb-profile-native-fields-node22-oct08.log.
- New profile-native-controls.spec.ts passes32/32 at320/1710 in four profiles
  (Chromium/mobile Pixel7 Chromium/Firefox/WebKit, three engine families), retries
  zero. Actual native validation/keyboard maximums, optional blank name/bio,
  Tab order/textarea Enter, trimmed submitted FormData, held pending duplicate
  guards and username/name/bio/multiple422 focus and retention are proved.
  Routes use controlled responses; these cases do not prove server persistence.
  Independent behavioral review has no blocker; optional-blank addition passes
  8/8 affected cases. Mac app-only keyboard preference is restored. Logs:
  /tmp/neb-profile-native-controls-final-oct08.log and
  /tmp/neb-profile-native-optional-fields-reviewed-oct08.log. Lint/format/types pass.
- Browser debugger examines all three620 CI traces: test assigns reset password
  while input disabled, initialization clears it before click, and no POST
  occurs. Unchanged local WebKit scenario fails5/5 with retries zero. Ignored
  diagnostic awaiting fields enabled passes5/5. Minimal tracked correction
  awaits each scenario field enabled before unchanged silent DOM assignment;
  final four-profile16/16 pass, retries zero, retaining payload/error/value
  assertions. Logs /tmp/neb-reset-silent-fill-original-oct08.log,
  /tmp/neb-reset-enabled-proof-oct08.log and
  /tmp/neb-auth-silent-fill-enabled-four-profiles-oct08.log. No product defect
  established by the disabled-control assignment; password managers remain open.
- Root integrated Node22 lint/types and **564 tests/42 files pass**:
  /tmp/neb-profile-auth-integrated-node22-reviewed-oct08.log. First check stopped
  on an ESLint warning in the browser debugger's ignored temporary configuration;
  its two diagnostic files are preserved under /tmp and removed from the app
  directory. Reviewed full check and scoped format pass; browser/artifact
  Gitleaks directory scans and checklist/diff checks pass. No test/retry/limit
  setting was changed to obtain these results.
- Checklist775/367 and section verdicts remained unchanged at this observation.
  Original prompt/request hashes match. Exact-source CI was pending.

### 2026-10-08 —606 exact-source recovery and immutable native/upload checks

- Pushed606ebb6c074b00d3c2b3848b71ad80a3e997320e passes all nine jobs in
  [CI37720755955](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37720755955):
  backend383, frontend564/42 files, browser smoke264/12 intentional skips with
  zero flaky/retried cases, full-stack120, foundation/secrets/both images/Release.
  Full retained log /tmp/neb-ci-606ebb6-reviewed-oct08.log. Actual CI merge
  e258f05903ac9dab215f82ca6e52b9c246636533 shares HEAD tree
  a620355dc1e77f3f241fe976654a40525be71638, verified through the commit API.
- Exact Git-archive configured606 production image builds, matches runtime
  release, mounts no app files and returns health200. Actual image ID
  sha256:dee255fdb6c95e38dc5bb3a24d6031ee13c9633819773a3c0d5ee6a99a132bd6.
  Optimized32 controlled profile-native plus16 auth silent-fill cases pass48/48,
  retries zero. Real3MiB API PUT/cancel/retry/ready/reload passes once, and four
  API Blob/CSRF/held processing/reload cases pass4/4. Total53 cases; app-only Mac
  keyboard preference restored/verified. No synthetic storage success or byte
  progress in the real upload cases. Source/scope/logs and numeric proof are in
  [sanitized606 candidate report](artifacts/frontend-candidate-606ebb6-2026-10-08.json).
- These gates cover606; subsequent CSS and account browser evidence are a
  separate working-tree packet. Original prompt/request hashes match;
  checklist775/367 remained unchanged at this observation.

### 2026-10-08 — Selected-tab contrast, tag target and account native controls

- Source-only inventory predicts selected-tab white-on-soft hover. Browser
  debugger proves contrast1.13:1 for actual selected Created hover/held press at
  320/1710, with normal/focus19.80. Scoped CSS changes only selected hovered text
  to existing ink, preserving secondary hover background and press translation.
  Regression initially fails both Chromium widths, then final8/8 pass across
  four profiles, retries zero: hover/press17.53, normal/focus19.80,3px keyboard
  outline, no overflow/page errors. Initial test tuple-inference type error is
  corrected. [State proof](artifacts/profile-tab-states-2026-10-08.json).
- Bounded Chromium editor probe2/2 at320/1710 finds format/size/icon targets44px,
  visible focus and native size disabled limits3/10, no contrast/overflow issue.
  Tag-remove target23.05×20.41 is below project44px target. Only two CSS minimum
  dimension declarations change; final8/8 browser regressions pass in four
  profiles:44×44 actual targets,40-character Unicode wrapping, literal markup
  as text, keyboard removal of intended tag with sibling retention, no accidental
  publication/submission or page error/overflow. Original successful browser run
  and corrected possibly-undefined test index diagnostic remain logged. Mac
  preference restored. [Tag proof](artifacts/editor-tag-controls-2026-10-08.json).
  Upload pending label retains pointer/hover while file input is disabled, but
  busy text/phase/Cancel are present; this does not prove duplicate submission.
- Account implementation audit finds native constraints/normalization coherent.
  New controlled native packet24/24 passes first run, then independent review
  recommends short current-password fixtures to detect an unintended minimum12
  on current credentials. Amended email/password16/16 pass; deletion8 unchanged
  cases already pass, all retries zero. Three forms at320/1710 in Chromium,
  Pixel7 Chromium, Firefox and WebKit (three engine families/four profiles).
  Native required/typeMismatch, keyboard11→12 new/confirmation minimum, Tab and
  visible focus, Show/Hide without submit, mismatch focus/no write, exact raw
  FormData and own-endpoint pending one-write guard are proved. DOM email strips
  edge spaces while retaining mixed case; backend lowercase has existing API
  evidence. Raw short padded current/deletion and padded new passwords are
  retained in the mocked payload. Empty deletion opens no confirm; dismiss
  retains input/no write; accept invokes own endpoint and controlled422 focuses
  associated retained error. This proves flow, not real deletion/scheduling.
  Reload clears transient email/password without a beforeunload dialog; no
  persisted-work or chosen dirty-navigation policy claim. Logs
  /tmp/neb-account-native-controls-initial-oct08.log and
  /tmp/neb-account-native-short-current-reviewed-oct08.log. Scoped checks and Mac
  preference restoration pass; independent coverage review has no blocker.
- Root final Node22 lint/types and564 tests/42 files pass on the stable combined
  source: /tmp/neb-controls-account-final-node22-oct08.log. Original prompt/request
  unchanged, checklist775/367 and verdicts unchanged. Current-source CI and
  configured optimized image remain required for this separate packet.

### 2026-10-08 — Native browser capability and historical RSC scope audit

- Cua opens a temporary own Chrome Explore tab on606 candidate18584; DOM control
  is available. Native Chrome app accessibility reads time out twice. Native tab
  Cmd+Equal returns without observed zoom change (DPR2, viewport1728×996 both
  before/after). No viewport override is used; temporary tab closed.200% native
  zoom/favicon/browser chrome/autofill/password-manager requirements remain
  capability gaps, not silently converted into deployment-only requirements.
- Independent performance audit matches historical raw report SHA and excludes
  context teardown: the probe clears its active sample before close. All291 RSC
  responses are200 text/x-component;284 abort and seven complete,142 fresh/142
  warm. Failure timestamps/request IDs/prefetch headers are absent, and mutable
  error arrays allow late events, so phase attribution is incomplete. Default
  production viewport prefetch from [Next Link documentation](https://nextjs.org/docs/app/api-reference/components/link#prefetch)
  supports probable origin, not cancellation cause/server impact. No measured
  bottleneck is established. Next bounded freshDiscover probe needs fixed idle,
  sanitized headers/IDs/timing/bytes/cancel flags, separate cleanup bucket and
  one actual navigation with correlated upstream logs. Retain every abort.

### 2026-10-08 — Exact e6 CI and confirmed SSR authentication defect

- Pushed e6f6dfc passes all nine CI37723657862 jobs: backend383, frontend564/
  42 files, full-stack120; smoke303 plusone flaky WebKit signup case and12
  intentional skips. Actual merge1202eafe7a31d878d69bbde855b9c85da87fdd78 shares
  HEAD tree90b707ea2317e7dcdee4d1341239bcf0fe8286c0, verified through API.
  Log /tmp/neb-ci-e6f6dfc-reviewed-oct08.log. Do not call this zero-retry smoke.
- Failed trace shows typed username/password becoming empty when email is
  corrected; native tooShort=false correctly describes empty password, not a
  backend failure. Deliberate WebKit delayed-chunk reproduction on immutable606
  (register source identical to e6) uses genuine keyboard events: enabled SSR
  inputs retain values through hydration, then email correction clears both
  sibling values. Fully hydrated control retains them; both zero registration
  POST/page errors. Private /tmp/neb-signup-hydration-oct08, not committed raw.
- Valid dummy-only SSR registration attempts default document GET/register
  with email,username,password query keys; recovery attempts GET with email.
  Both requests are intercepted and aborted before upstream; no account/API
  mutation or real credentials. Independent security calibration: Medium/high
  confidence in native query generation, no measured actual recipient/history/
  upstream exposure. Repository Nginx access logging removes query. Sanitized
  [reproduction](artifacts/auth-hydration-reproduction-2026-10-08.json).
- Working-tree fix adds initial-ready state to Register/Forgot and disables
  named inputs/password visibility/submission until the existing activation
  effect. Login SSR form is absent while checking; Reset already disables initial
  controls. Post-ready pending behavior, FormData, ownership, callbacks and
  navigation are preserved. Two pre-effect availability tests add meaningful
  coverage; Node22 auth37 pass. Independent correctness/security reviews find no
  blocker. Delayed-JS browser regression and final exact-source image/CI remain
  required. No build/promotion/readiness claim for this new source yet.

### 2026-10-08 — Bounded RSC prefetch observations

- First fresh Discover probe exits1 before idle because streaming temporarily
  exposes fallback/settled main elements. Corrected settled-main selectors then
  complete two fixed10-second windows and one real public-card transition on
  unchanged606 image18584. Actual26 RSC requests: five finishes/21 canceled
  ERR_ABORTED, all21 Next-router-prefetch1/HTTP200; seven tree-prefetch. Discover18
  cancel roughly9.85seconds before navigation. Actual non-prefetch navigation
  finishes200, cleanup failures/page errors/console errors zero. Canceled reads
  receive43,535 decoded/10,881 encoded data-event bytes; these are partial sums,
  not completed transfer sizes. Existing exact-window frontend/old-web logs are
  empty, providing no server-cost conclusion.
- Separate transient native cancel-wrapper run completes25 RSC/two finishes/
  23 cancellations, page/console/cleanup errors zero. It records zero wrapper
  cancellations and signal associations, with successful restoration. Prefetch
  source calls lack a signal, and no total fetch-invocation counter was added;
  cancellation caller is still unproved. Versioned Next16.3.8 reader cancellation
  requires explicit byteLimit, which tree-prefetch omits. No blanket intentional
  truncation explanation or failure suppression. Sanitized
  [observations](artifacts/frontend-rsc-prefetch-observation-2026-10-08.json)
  retain raw private report hashes, failed/completed runs and scope limitations.

### 2026-10-08 — Hydration regression passes; additional native failures retained

- Working-tree combined Node22 lint/types and566 tests in42 files pass. Corrected
  Register/Forgot delayed-JS packet passes16/16 across Chromium/mobile/Firefox/
  WebKit, retries zero,41.2seconds. App is nebqa development frontend18080; using
  an archive for the runner does not prove an optimized image. SSR named fields,
  password visibility and submit remain disabled; keyboard cannot edit/submit
  until activation, then controlled native validation and one own POST succeed.
  First selector-timeout run remains retained; Mac app keyboard setting restored.
  Logs /tmp/neb-auth-hydration-working-tree-reviewed-oct08.log and
  /tmp/neb-hydration-native-integrated-{lint,types,tests}-oct08.log. Sanitized
  [hydration report](artifacts/auth-hydration-reproduction-2026-10-08.json) records
  exact pending production/CI scope.
- New editor/preference native packet on immutable60618584 reports27 pass/
  21 fail in3.7minutes, no retries/flaky/skips. Retained private traces under
  /tmp/neb-editor-preference-reviewed-oct08. Desktop select requires genuine
  typeahead; mobile emulation uses its separate native menu sequence. WebKit's
  final reverse link boundary uses documented Option modifier; repeat reload
  after dismissed beforeunload is recorded by actual browser policy. A fresh
  dirty document must still produce an actual accepted beforeunload.
- Independent Firefox probe confirms individual checkbox disabling moves focus
  toBODY during privacy/notification save. After controlled200/re-enable focus
  staysBODY; nextTab repeats the initiating checkbox. Document focus remains
  true, exactly one correct write each. /tmp/neb-preference-focus-oct08/result.json.
  Request-owned conditional restoration is being implemented; test refocusing
  would hide the defect and is excluded.
- One mobile320 description native501-character input reports React185 before
  any autosave PUT; repeated dirty-status update is only a candidate explanation.
  A desktop-typeahead helper on mobile subsequently fails before description;
  do not count that run as a React185 reproduction. No typing slowdown, retry
  increase, page-error filter, completed readiness or public deployment claim.

### 2026-10-08 — Existing evidence reconciled to12 checklist items

- Independent bounded reconciliation finds four remaining section42 local
  contracts already observed. The09-30 PostgreSQL custom dump/checksum/isolated
  restore preserves user/board/migration counts3|7|59. The executed
  [backend rehearsal](artifacts/mixed-backend-rehearsal-2026-10-08.json) applies
  forward migrations before compatible workers/web, operates old web on that
  schema, consumes old/new mail tasks with the compatible new worker, then
  restores old web while retaining schema/worker and verifies users, records,
  existing sessions and fresh logins. HEAD backend tree equals rehearsed a3:
  db16171ede68e4fb990742e51c35b4c1a5952322; no working-tree backend edits.
  These four local backup/compatibility/rollback/order items close; section42
  is verified before deployment. Managed snapshots/WAL/off-site recovery,
  online locks, actual registry/config/target rollout remain separate gates.
- Six section76 traffic-inspection items map to the existing hashed raw report
  behind [performance evidence](artifacts/frontend-performance-2026-10-08.json):
  16 optimized15632 image samples record545 responses,529×200/16×202, zero
  redirects, only expected configured localhost18580 origin. No unexpected
  asset404/401/500 or unintended local/staging origin in this bounded traffic.
  [Asset rehearsal](artifacts/frontend-assets-rehearsal-2026-10-08.json) checks
  50 retained hashes/HTTP reads through promotion and rollback. This is not
  SSR-upstream/target ingress or current working-tree proof. Query-string exposure,
  duplicate/RSC causes, response sizes and sensitive-body review remain open.
- Two section103 combinations map to actual
  [frontend rehearsal](artifacts/mixed-frontend-rehearsal-2026-10-08.json):
  c1 frontend/a3 backend3/3 and15632 frontend/c1 backend3/3, zero retries.
  New sitemap/old backend503/no-store/Retry-After300 enforces backend-first
  rollout.606 also passes five actual API upload/persistence cases against c1.
  Current hydration/focus/editor frontend changes require their consolidated
  exact-image/CI refresh; section103 remains partial despite historical pair
  observation. CDN/previous actual target deployment/config/command stay open.
- No new test or invented result used for this reconciliation.12 previously
  observed items close: checklist787 checked/355 unchecked;58 verified/
  40 partial/six N/A/one deployment-only. Section72's required engineering gate
  contains no checkboxes, explaining why substantial build/test work changes
  no item counter.

### 2026-10-08 — Native dirty controls and approved UI wrap

- Test-only dirty correction completes8/8 affected native cases, retries zero,
  /tmp/neb-preference-dirty-final-reviewed-oct08.{log,json}, nebqa development18080.
  It aborts only unexpected read-only SSR card media and uses actual browser
  window.location.reload for the fresh accepted beforeunload. Previous16 editor
  cases passed; retained runs cover48 relevant cases without a new single final
  complete48 gate. Scoped Prettier/ESLint/types pass. Earlier failures remain logs.
- User approves full wrap in profile list cards. Seven CSS lines give relevant
  grid children min-width0 and overflow-wrap:anywhere. Actual320 page width falls
  from854 to320; full92-character name/handle link stays inside286px card,
  scrollWidth284. Screenshot /tmp/neb-ui-audit-oct08/profile-following-wrap-320.jpg.
  No truncation, font, avatar or arbitrary layout redesign.
- User requests visible mobile alternatives. CurrentA and separate privateB
  shown at320×667, /tmp/neb-ui-audit-oct08/game-variant-{a,b}-320.jpg. B puts actual
  board before collapsed native mark-style disclosure, description and actions;
  selected summary/disclosure checked in real Chrome. Source proposal is private
  /tmp/neb-ui-mobile-game-preview-oct08/frontend, not applied to workspace.
- Real currentA board at320 clips even Morning stretch: cell94.66px, text105.59px,
 24px font/26.4px line height. Component is identical in privateB. User choice
  requested for responsive font or explicit ellipsis; source unchanged. Local
  screenshot /tmp/neb-ui-audit-oct08/current-cell-text-clipping-320.jpg.
- Exact-source consolidated image/CI and deployment checks still pending.
  Checklist remains787/355;58 verified/40 partial/six N/A/one deployment-only.

### 2026-10-08 — Approved mobile choices; real SSR body deadline

User chooses B and responsive font sizing. Implementation proceeds in existing
player/CSS; desktop arrangement and full-text panel retained. Original A/B/clipping
and approved wrapping screenshots saved under artifacts/ui-review-2026-10-08.
Wide profile wrap also verified: viewport/page1728, link271.5/scrollWidth270, full
92-character text; bounded Chrome console warnings/errors empty.

[Native SSR proof](artifacts/ssr-stalled-body-timeout-2026-10-08.json) exercises real
Node24.16.0 fetch and AbortSignal.timeout4000 with one owned ephemeral HTTP200
response whose JSON body stalls. Headers13.676ms; genuine TimeoutError4004.134ms;
null/unavailable fallback, oneGET/no retry/no-store. No QA/Docker/app mutation;
probe globals/env/sockets/listener restored. This verifies existing server.ts
deadline includes body parsing; section82 broad timeout item remains open pending
client/gateway/provider scope.

### 2026-10-08 — Approved responsive player and cancellation verification

- User-approved B is implemented with stable SSR markup: mobile board/counter
  before native mark-style disclosure, description/actions below; desktop visual
  arrangement preserved and actual radio fieldset visible. Board-width font scales
  within original desktop cap. Independent source review finds no blockers.
- Native Chrome320 confirms Morning stretch17.04px font, text37px inside93px cell,
  full page width320. 700/701 breakpoint has correct summary/fieldset visibility
  and no horizontal page overflow; final desktop viewport restored1728×940.
  Bounded console errors/warnings empty. Final screenshot is saved under
  artifacts/ui-review-2026-10-08/game-approved-b-readable-320.jpg.
- Controlled 3/5/7 layout/short-text/Tab/Enter/radio/selection/desktop-resize cases
  pass4/4 across Chromium/mobile/Firefox/WebKit on a current-source isolated dev
  server. Genuine QA SSR delayed-script cases pass4/4: board position and size
  remain stable before/after hydration; no page errors or retries. These are
  development checks, not an optimized release-image gate. Initial root runner
  setup failure used fabricated board id against real SSR404 and an outputDir
  that erased its manual fixture manifest; original failed report retained.
- [Actual API body observations](artifacts/api-body-cancellation-2026-10-08.json)
  record native20s read deadline20014.568ms/no retry and confirmed caller-abort
  misclassification. Small source correction preserves the original native body
  AbortError rather than converting it to invalid_response/status200. Updated
  private native probe preserves exact object identity in47.601ms, oneGET/no
  retry/full cleanup. Four regression units cover cancellation identity, deadline
  and malformed JSON; client48/48 pass. Initial diagnostic numericcode assumption
  is retained separately, corrected without changing identity assertions.
- Consolidated Node22 lint/types and581 units in43 files pass39.71seconds.
  Scoped format21 frontend files and git diff check pass. Existing auth/focus/editor
  corrections are included. Exact-source CI and configured production image remain
  required; actual provider/target gates remain open.

### 2026-10-08 — Exact approved-UI image, API deadlines and CI failure

- [Configured5e candidate](artifacts/frontend-candidate-5e71cd8-2026-10-08.json)
  runs exact Git-archive source5e71cd8c8f722a3512d868401d3c0d99e49332a1, matching
  build/runtime IDs, zero app mounts, frontend/backend health200. Controlled
  native packet156/156 and separate real API/SSR packet9/9 pass, retries/skips/
  flaky zero. The former includes16 editor,32 preferences and16 delayed-JS auth
  cases; the latter proves actual Blob/CSRF/processing/persistence,3MiB byte
  progress/cancel/retry and stable SSR hydration. Mac keyboard setting restored
  and verified after each run. Local loopback/illustrative origin/backend c1;
  no target deployment claim. Raw reports retained privately under /tmp with
  SHA-256 recorded in the candidate artifact.
- [CI37735197541](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37735197541)
  completes seven successful jobs: backend383, frontend581/43 files, smoke372/
  12 intentional skips with no flaky cases, foundation, secrets and both images.
  Full-stack122 passes/one Android failure; Release fails. Retained trace shows
  heading matched the catalog H2 while frameUrl remained /explore; disclosure
  isVisible=false before game navigation completed. Waiting for actual grid and
  enabled cell corrects test readiness, without changed retries/timeouts/source.
- Initial corrected local flow packet4 pass/one Firefox failure: Cross selection
  passed before later /create session500. Candidate proxy records ECONNRESET/
  socket hang up; backend closure cause remains unknown. Separate unchanged-source
  Firefox repeat1/1 passes. All five relevant browser profiles therefore have
  successful affected-control observations across these runs, not one clean
  consolidated five-case gate. Earlier failed reports/traces remain private.
- [Actual Nginx deadlines](artifacts/nginx-upstream-deadlines-2026-10-08.json)
  exercises unchanged current template via official envsubst and owned stalled
  listeners: health50410.029s, genericAPI50460.014s, auth50460.022s. All three
  pass, original recovery HTML hash/no-store/security headers, one upstream accept
  each and owned-container/network cleanup verified. Initial private harness
  readiness failure produced no measurements; its cause remains unknown. Revised
  harness retains startup diagnostics and uses an ordinary isolated bridge.
- Applicable local section82 timeout maps native client20s body read, SSR4s body
  read, upload120s guards and actual gateway10/60s inactivity deadlines. It does
  not prove a total-transfer ceiling, connect/send/frontend120s, actual provider/
  CDN/TLS or target load. Item closes within the tracker predeployment definition;
  checklist788/354,59 verified/39 partial/six N/A/one deployment-only. Final
  corrected-source CI and real deployment remain separate gates.

### 2026-10-08 — Approved consistent report backdrop

Native Chrome comparison shows report-dialog had both46% native backdrop and a
46% full-screen spread shadow; auth-dialog has only the native46% backdrop. The
user chooses the same single backdrop as login. The report keeps its original
small window shadow; only the redundant spread layer is removed. Eight browser
cases pass across Chromium/mobile/Firefox/WebKit, retries/skips/flaky zero:
320/1728 modal fit without page overflow, computed single backdrop/shadow, keyboard
focus stays inside, Escape closes and focus returns to Report. Mac keyboard
setting restored and verified. This is current-source private development proof;
optimized-image and final-source CI remain separate. Narrow/wide screenshots are
in artifacts/ui-review-2026-10-08/report-approved-single-backdrop-{320,1728}.jpg.

### 2026-10-08 — Existing native field evidence mapped to section7

Nine previously unchecked field items now map to actual executed scenarios, not
new tests or source assumptions. The156-case5e native report contains profile32,
account24, preference32 and editor16 cases. Profile username trimming and account
padded-email FormData cover whitespace; backend email-change normalization proves
After@EXAMPLE.TEST becomes after@example.test, while passwords retain whitespace.
Profile textarea Enter preserves exact multiline payload/error state. Real editor,
profile, guest share, comment and adversarial-content journeys cover permitted
Unicode/emoji and literal quotes/HTML punctuation without interpreting markup.
Username ASCII restrictions are explicit validation, not silent normalization.

Only three numeric UI controls exist, all bounded ranges. Executed Home/Arrow
clamps, thousand-digit rejection, negative/out-of-range opacity rejection, decimal
rounding0.4567→0.457 and real huge/negative/decimal board-size400 observations map
the three numeric bullets. Source/test references are in the API/auth-editor and
profile/account matrices and earlier dated results. No new all-form Enter/Tab,
validation, clipboard/autofill/password-manager or visual-state coverage is claimed.
Checklist797/345; section7 remains partial, section verdicts59/39/six N/A/one
deployment-only.

Three further section7 validation items map to executed form coverage: auth native
constraints and real weak-password/taken-username errors; profile/account/editor
native field/error-focus cases; real root/reply/edit/report400 field-feedback
packet; guest required/whitespace/focus checks; and real Explore tag-limit error/
focus cases. Login/network/token failures remain understandable action errors
rather than fabricated field errors. Validation clarity, nearby errors and
sensible focus close within those applicable paths. Checklist800/342; section7
remains partial. Required/optional copy, global limit policy, native capabilities
and remaining keyboard/dirty-form mapping are not inferred from these results.

### 2026-10-08 — Approved report image and complete source992 gate

[CI37739609098](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37739609098)
passes all nine jobs on9920e83317044102c69d5dba2f40ab2df934ea75: backend383,
frontend581/43 files, smoke372/12 intentional skips, full-stack123, foundation,
secrets, both production images and Release. No browser flaky cases are reported.
Actual checkout70b2b23681e971e41b8a8b7e641023427b7fcd5f and branch head share
full tree d2e881660d3ef91fc1d2b052e2f0dc2cdf1a4370.

[Candidate proof](artifacts/frontend-candidate-9920e83-2026-10-08.json) records
exact optimized image sha256:164823c8653f2e7263dee1427f84df5a6855bafe613df22e0438e940a2932a65,
matching build/runtime/source IDs, no application mounts and health200. Five
real affected product flows pass in23.8s, retries/skips/flaky zero. Native Chrome
320/1728 confirms46% single backdrop, small window shadow, fitting modal, Escape
and trigger-focus return. Native report clipboard paste preserves two lines,
Unicode/emoji and literal quotes/HTML punctuation exactly; no submission, draft
cleared and original empty clipboard restored. Email/password exact paste values
are privacy-redacted and cannot establish autofill/password-manager behavior.
Four older message-channel console entries predate replacement; no new entries
appear during bounded current-image modal interactions. Eight separate controlled
modal cases pass in four browser profiles. Prior165 cases remain scoped to5e.
Local loopback/illustrative origin/development backend; target deployment remains
unverified. Subsequent Explore changes require a separate exact-source gate.

### 2026-10-08 — Explore repeated submission and real browser Back

The15-file form inventory identifies13 data-mutating forms: login/register/
forgot/reset, profile, account email/password/deletion, root/reply/edit comments,
report and guest share. Their synchronous guards plus editor publication have
executed unit/native evidence in the API/auth-editor, profile/account and social
matrices; shared comment beginAction protects all three comment submissions.
Explore was the remaining interactive search exception: repeated pending submits
could emit distinct analytics event IDs and restart the read.

The correction normalizes a filter/page key and sets a synchronous lock before
analytics/URL changes. Only its own completed non-aborted request releases it;
changed criteria remain usable. Applied-target tracking distinguishes queued
older URL transitions from leaving the destination through Back. A new Back
regression fails before that correction and passes afterward. Independent review
finds no remaining issue in the bounded patch. Ten Explore units pass; integrated
Node22.23.1 lint/typecheck and587 units/43 files pass in39.95s. Scoped formatting
and diff checks pass.

[Browser proof](artifacts/explore-pending-submission-2026-10-08.json):9/9 cases
in Chromium/Firefox/WebKit,31.6s, retries/skips/flaky zero. Held B response plus
Search/Enter repeats produces one B read and one search event. Completion permits
a second. Changed B→C is accepted and displays C; a cancellable extra prior-B
read can occur during URL transition, so no one-request-per-action guarantee.
Actual history S→Skip to content anchor→replace withB→page.goBack restoresS;
resubmittingB yields the second B read and second search event. No injected history.
All pageerror arrays are empty; console messages were not collected. These are
private development UI checks with intercepted API/analytics, not backend or
production-image proof. Initial Turbopack harness failed on an external dependency
symlink before assertions; existing webpack mode succeeds. Owned listener18586
is stopped; QA and OS preferences unchanged. Sanitized report records source hash.

Section5 repeated-submit item closes; layout stability remains open. Checklist
801 checked/341 unchecked;59 verified/39 partial/six N/A/one deployment-only.
This new runtime patch requires its committed-source CI after the successful992
gate; no target infrastructure or native-device result is inferred.

### 2026-10-08 — Complete Explore source gate and optimized runtime

[CI37743142188](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37743142188)
passes all nine jobs on0655989fa176d2337fbd5ea93ce082073f7a413a: backend383,
frontend587/43 files, smoke372/12 intentional skips, full-stack123, both images,
foundation, secrets and Release. Browser summaries show no flaky cases. Smoke
lasts18.9min and live9.4min; no timeout/retry setting changes were made. Actual
merge1d7d3cdaecc46413758c71796697013b58969882 and branch head have full tree
8221a4cf06f03b7031fbefcb6d7deffb8110f71c.

The existing [Explore proof](artifacts/explore-pending-submission-2026-10-08.json)
also records optimized image sha256:a66207cd968c208e265301cc92668592dcb3b7798eb68db1fd7afb42f532ea56,
matching source/build/runtime/label, no app mounts, frontend health200. Nine
controlled guard scenarios pass in Chromium/Firefox/WebKit on this image. API/
analytics are intercepted in these cases; real-backend search flows are covered
separately by CI, not inferred from interception.

Eight guest initial-layout observations use real API at390/1710 on Discover,
Explore, Create and a synthetic public board. All HTTP200, page width within
viewport, pageerror and console warning/error arrays empty. Seven observed CLS0;
mobile game0.0006855929487179487. First/last board358×358 mobile and760×760 desktop
remain equal; game SSR markup exists. First observed frame can follow hydration,
so earlier explicit delayed-script proof remains separate. No global layout/CWV
or capacity claim.118 GET RSC ERR_ABORTED failures are retained; cause/server cost
remain open. Five initial diagnostic selectors failed; only those five samples
were repeated after correcting external selectors. Prior nine guards and three
successful samples were not repeated. Source/OS/QA/data unchanged during probes.
Sanitized record keeps raw hashes; logs/screens are retained in external task
scratch. Checklist801/341 and section verdicts59/39/six N/A/one deployment-only
stay unchanged; section5 layout stability still requires broader itemized scope.


### 2026-10-08 — Native social and Explore keyboard ownership

[Sanitized keyboard proof](artifacts/native-form-keyboard-2026-10-08.json) records
configured optimized source0655989fa176d2337fbd5ea93ce082073f7a413a, image
sha256:a66207cd968c208e265301cc92668592dcb3b7798eb68db1fd7afb42f532ea56,
matching module hashes and original report hashes. Six Chromium/Firefox/WebKit
cases at320/1710 cover30 root/reply/edit/report/guest-share form walks. Native
Tab/Shift+Tab traverses active controls; textarea Enter inserts exact newlines,
and submit Enter invokes only the intended form endpoint. Five held requests per
case return controlled400, with retained values and no unrelated or real backend
writes. Trimmed payloads preserve Unicode/emoji/newlines/literal markup punctuation.
Page-error arrays are empty; expected intercepted progress404/validation400
resource errors remain in console evidence. This is UI ownership/recovery proof,
not real persistence or a clean-console claim.

The original four Chromium/Firefox cases pass. Initial WebKit320/1710 cases opened
Report with a pointer and failed the launcher-focus expectation after Escape. A
separate pointer probe confirms BODY afterward. Only those two diagnostic launches
changed to focus Report then Enter; both keyboard cases pass without retries.
Corrected WebKit keyboard opening traps Tab and Escape restores launcher focus.
Pointer behavior
is preserved as a separate observation; the desired policy awaits the user.
No universal pointer-focus return is inferred. App-only WebKit keyboard navigation
was temporarily enabled and its original absent setting restored and verified.

Three separate Explore cases pass forward/reverse Search→Author→Tags→selected
sort radio→Search submit→Clear traversal, ArrowDown Popular→New, and Enter on the
own form with one search event. API/analytics are intercepted and two same-query
reads appear in the transition; no one-HTTP-request claim. Existing nine pending
guard cases were not repeated. These cases pass in8.99s without retries/skips/
flaky results.

Prior auth/profile/account native packets cover the other eight data-mutating form
kinds, and editor native controls are recorded separately. Combined14-form
inventory supports exactly section7 Enter/Tab and section8 intended submit.
Checklist804 checked/338 unchecked; verdicts59 verified/39 partial/six N/A/one
deployment-only stay unchanged. Required/optional/limit copy, native capabilities,
dirty-form policy, all-control visual states and global layout stability remain
open. Complete source065 CI remains the independent gate recorded above; no
source change, target service or physical-device result is implied.

### 2026-10-08 — Public Follow control states

- [Additional profile control proof](artifacts/profile-tab-states-2026-10-08.json)
  records two controlled failure/retry flows plus two native focus probes,
  Chromium320/1710 on configured source065. Hover/held press, native Tab/Shift+Tab
  focus, pending “Saving…”/disabled/status,503 retention and own POST204 retry pass.
  DELETE503 retains Following. All mutations, including analytics/client-errors,
  are intercepted; no real backend writes, unrelated action writes or page errors.
  Expected503 console errors remain. Initial harness failures:none.
- Button height stays44px and mobile width288px; desktop widths vary with labels
 89.61/99.22/118.42px. This is a scoped observation, without a global layout verdict
  or a new interface decision. No checklist marks change.

### 2026-10-08 — Editor custom controls and cache readiness correction

- [Additional editor control observations](artifacts/editor-tag-controls-2026-10-08.json)
  pass two Chromium320/1710 cases on configured065. Size/format/tag actions,
  disabled size limits, native focus and download disclosure work without overflow.
  Size/format/tag pointer states keep their appearance; feedback treatment awaits
  the user's choice. No source design change is made.
- Initial mobile harness expected the inspector during inline editing, and desktop
  incorrectly expected zero autosaves. Source and existing mobile test confirm
  pointer activation followed by Escape; corrected original pointer cases pass.
  Five legitimate autosave PUTs per case are intercepted; no manual publication,
  export, real backend writes, page or console errors. Raw failures are retained.
- Readiness previously returned200/ok even when cache round-trip returned absent
  or unexpected data and checks.cache was error. The minimal correction returns
 503/degraded for that branch. Five endpoint regressions cover healthy, absent,
  wrong, write-exception and read-exception results, including exact safe JSON.
  Before correction:two regressions failed, three passed. After:13 scoped
  observability tests pass in2.03s on localPython3.14.5 with SQLite in memory.
  Initial full module run had one setup error from unavailable postgres hostname;
  changing only the isolated test environment resolves it. Ruff/check/format pass;
  independent review finds no issues. Actual Redis is not exercised by these mocks.
  The subsequent388-test Python3.13/PostgreSQL CI job passes; the complete gate
  fails as recorded below. No global dependency-availability mark or production readiness claim is added.

### 2026-10-08 — Actual social beforeunload dialogs

- [Native form proof](artifacts/native-form-keyboard-2026-10-08.json) adds eight
  complete Chromium/WebKit cases at390px on configured source065: root/reply/edit/
  report trusted input, real beforeunload dismiss and accept, retained exact text
  on cancellation, verified full reload on acceptance. Accepted root/reply/report
  drafts are empty; edit returns to its server original. All mutations intercepted,
  business mutations0, real writes0, pageErrors empty; expected progress404 console
  errors remain. No product/OS/QA changes or new checklist marks.
- Original Firefox page.reload shows no warning; DOM Location.reload after trusted
  activation shows actual warnings and cancellation retains text. Final four
  cases did not observe a fresh document within5s after accept. Early prototype
  PASS cases read old DOM and are excluded. Exact installed Firefox command and
  DOM reload paths differ, but the internal reason and accepted-reload behavior
  remain unresolved. Attempts stopped; no product-hook defect or global pass
  is claimed. Raw initial/prototype/final reports and trace references preserved.

### 2026-10-08 — c6 source CI failure and player effect replay

[CI37750054487](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37750054487)
for source c6d770dc3f7583967d9977675dd14f5456081e24 finishes with seven passing jobs:
backend388 on CPython3.13.16/PostgreSQL, frontend587/43 files, smoke372/12 intentional
skips, foundation, full-history secrets and both production images. Full-stack
reports96 passes, two failures and25 not run; Release fails. No flaky summary or
automatic retry is recorded. The previous complete065 gate remains historical.

The report/archive case loses its dialog after clicking Report, before report
POST or archiving starts. The accessibility case observes the title and marking
group, then evaluates an empty heading list. Both trace snapshots and the latter
PNG show “Opening bingo…”; relevant GETs return200 and trace consoles contain no
warnings/errors. CI uses next dev with React StrictMode. The one-use initial-data
ref makes effect replay discard matching SSR data and reset player state. This
source correlation is reproduced by two new local StrictMode tests for guest
and registered viewers: both fail before the correction, both pass afterward.
The trace itself has no explicit effect-replay instrumentation. Raw CI log,
artifact11538805351 and sanitized trace proof remain in external task scratch.

The correction reuses matching initial data at loadVersion0. Auth refresh and
retry still advance loadVersion; a different board ID still fetches fresh data.
The two affected E2E scenarios wait for an enabled game cell, and Report asserts
its dialog before filling. No timeout, retry, StrictMode or error-filter policy
changes. Independent review finds no correctness/regression issues. All38 player
tests pass after the fix; integrated Node22.23.1 lint, TypeScript and589 tests in43
files pass (38.55s). Scoped ESLint and owned-file Prettier also pass on local
Node24.19.0. The next exact-source complete gate remains required; existing
optimized-image observations stay scoped to065.


### 2026-10-08 — ceb CI preparation timeout; same-source failed-job repeat

Source ceb11d04c70d85a75df9776ae0b5b98ba5776068 has passing frontend quality,
589 tests/43 files and production build, browser smoke, foundation and secrets in
[CI37754016843](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37754016843).
Attempt1 backend113233978472 is cancelled after its20-minute job limit. Actual
raw log confirms pytest never starts: the preceding apt installation waits for
fonts-noto-cjk61.2MB and fonts-noto-core13.3MB from azure.archive.ubuntu.com.
CJK starts09:04:55, is ignored09:19:11, retried09:21:47; cancellation09:23:53.
The Run backend tests step includes package installation; its19:04 duration is
preparation, not test execution. No test-collection/progress/results appear.
Independent CI analysis confirms the cause and unchanged backend/workflow since
c6. No application/DB deadlock is established. Full-stack and production images
are skipped; Release fails. The aggregate CLI log download initially fails its
results-receiver transport; direct job-log retrieval succeeds and is preserved.

One repeat uses gh run rerun37754016843 --failed, keeping the exact source and
successful frontend/smoke/foundation/secrets results. At that snapshot attempt2
was in progress; its subsequent completion is recorded below. No timeout/retry-
policy, assertion or source change is made. The complete gate records actual
font installation, pytest and dependent full-stack/images/Release results.


### 2026-10-08 — Complete form clipboard inventory and observed CSRF copy gap

[Clipboard artifact](artifacts/native-form-keyboard-2026-10-08.json) records31/31
actual trusted paste/insertFromPaste/exact-value cases and23/23 ordinary-copy
roundtrips on configured source065, isolated Linux Chromium149 at390px. It covers
all24 editable text fields of14 form kinds, six editor surfaces and two-cell
shared text. Eight password fields support paste; native password copy is not
attempted. Browser Clipboard API seeds only dummy data in the isolated runtime;
actual Control+V/Control+C performs the action. No Mac UI/OS/private clipboard,
real business writes, uploads or reseeding. Analytics is intercepted; page errors
are empty, with two expected controlled progress404 errors. Initial runtime,
forwarder, locator and mock/SSR identity failures are retained; only affected
samples are corrected. No repeated31-case gate is claimed. Physical devices,
Firefox/WebKit clipboard, autofill/password managers and other conditional editor
states remain unverified. Section7 clipboard bullet is checked:805/337 total.

A separate real empty/no-cookie POST/register returns403 before account creation,
with “CSRF Failed: CSRF cookie not set.” in its common error envelope. Replaying
that actual envelope in one intercepted Login POST shows exactly “detail: CSRF
Failed: CSRF cookie not set.” and retains the fields. Screenshot and actual HTTP/
UI proof remain private outside the repository. No actual Login write, unexpected
mutations or page errors; expected mocked403 console remains. This confirms a
technical user-facing error rather than a missing-fixture hypothesis. The user
is asked to choose the replacement message before any UI copy change. Section6
is reopened:58 verified/40 partial/six N/A/one deployment-only. Other pending UI
choices remain pending; no replacement or recovery behavior is silently applied.


### 2026-10-08 — Exact ceb complete gate after preparation-only repeat

[CI37754016843](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37754016843)
attempt2 completes successfully for ceb11d04c70d85a75df9776ae0b5b98ba5776068:
all nine jobs pass. Backend388/98.54s on Python3.13/PostgreSQL actually follows
completed Noto font installation; frontend589/43 files, smoke372/12 intentional
skips15.6min and full-stack123/9.1min pass. No browser flaky summary appears.
Foundation, secrets, both production image builds/scans and Release also pass.
Only failed/dependent jobs are repeated after the documented external download
cancellation; successful frontend/smoke/foundation/secrets are reused. Browser
assertions, retries and timeout policies are unchanged. Actual CI merge
3d1078d83069ba50a205226e5019e852c12379a6 has complete tree
1525cd34365574bbf60fa795c6ccd5e6da69bf9b, matching branch source (GitHub Git API and
local git tree). The full raw log and both backend attempts remain private in
external task scratch. No registry promotion, merge or deployment occurs.

The complete gate proves the current player replay correction; it does not make
source065 configured clipboard/layout packets current-source runtime proofs or
resolve the observed CSRF copy, pending UI decisions, native device capabilities
or real deployment requirements. Checklist remains805/337, verdicts58/40/six N/A/
one deployment-only. No extra checklist marks are inferred from CI.


### 2026-10-08 — Native Linux password-manager Login and account scope

The [native form artifact](artifacts/native-form-keyboard-2026-10-08.json) adds
one genuine Chromium password-manager Login journey on configured065. Built-in
WebUI Add/Save, native suggestion, exact DOM/FormData and controlled Login JSON
agree; no application DOM-fill/JS/CDP synthetic autofill or SQL/preferences
credential injection. Full Chromium149 uses an owned persistent Linux profile,
basic password store and omits enable-automation. Two intercepted Login400s
(suggestion Enter, then explicit button) and analytics have no real business
writes; page errors empty, expected400 console retained. Initial headless-shell
WebUI failure and dialog-locator correction remain in the raw record.

Three separate Change email/password/delete attempts save another dummy credential
through WebUI but do not fill current-password: DOM/FormData remains empty. New
email/new passwords retain intended values; no auth payload or business writes.
This remains unverified capability/form semantics, not a confirmed defect.
The three forms have no current-email username anchor. Chromium's
[password-form guidance](https://www.chromium.org/developers/design-documents/create-amazing-password-forms/#use-hidden-fields-for-implicit-information)
recommends a CSS-hidden username input for implicit identity. That markup
observation does not prove the cause of this Chromium149 attempt.
Owned profiles/containers/forwarders are removed; no Mac/private vault/OS changes.
No password-manager/autofill checklist marks or generation/automatic-save claims.


### 2026-10-08 — Limits of native autofill follow-up

One controlled Change email experiment adds only a CSS-hidden readonly username
anchor with the current email. Native manager fill still leaves current-password
empty and preserves the new email. The stored credential username was not read
back; neither an application cause nor a source fix is established. No account
username-anchor change is made from this negative experiment.

A separate native Addresses WebUI attempt enters dummy Name/Email and clicks Save,
but the resulting stored profile is not verified. Four target contexts remain
empty while retaining other entered fields. These results cannot establish an
application defect or unsupported browser capability without a confirmed seed.
One profile PATCH receives controlled422; analytics is intercepted. No real
writes or page errors. Owned Linux profiles/containers/forwarders are removed.
Raw hashes and scope extend the existing
[native form artifact](artifacts/native-form-keyboard-2026-10-08.json); general
browser autofill/password-manager bullets remain unchecked.


### 2026-10-08 — Registration credential identity metadata

Registration now identifies Email as autocomplete username and the public handle
as nickname; Password remains new-password. Login and backend LoginSerializer
already authenticate by email. Names, validation, labels, values and request
payload remain unchanged. This corrects semantic metadata; no wrong saved
credential or automatic-save-after-registration defect was observed.
The [HTML autocomplete definitions](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofilling-form-controls:-the-autocomplete-attribute)
and [email login guidance](https://web.dev/articles/sign-in-form-best-practices#help_users_to_avoid_re-entering_data)
support those roles.

Existing37 auth-submission cases and full Node22 lint/typecheck/589 tests in43
files pass. A current-source dev browser reads all three corrected attributes,
but all fields remain disabled after its15s readiness wait:21 document/CSS/JS/icon
responses200, no failed requests/page or console errors, no session request.
No cause is established, no payload/retention success is claimed and no timeout,
source or service policy is changed from that observation. The earlier configured
source065 is untouched. The subsequent metadata source requires its own exact CI;
ceb remains the latest complete gate until that result is recorded.


### 2026-10-08 — Complete224 gate and private logging/cache corrections

[CI37763092789](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37763092789)
passes all nine jobs for22429b12f51e7f22dd9ab80018371b03ffee9b2c:388 backend91.78s,
589 frontend/43 files,372 smoke/12 intentional skips14.8min and123 live8.7min,
foundation, full-history secrets, both production images and Release. No flaky
summary. Merge7d4f83a9e924be73358524b728fad30092061090 has complete tree
6ba0b96f63c5220d0a188a43bedcf783638d02bf, matching branch224 (raw checkout log,
local git tree and GitHub Git API). Raw2MB log remains in external task scratch.
Registration credential metadata therefore has a complete source gate.

The [native artifact](artifacts/native-form-keyboard-2026-10-08.json) adds six
read-only privacy cases on frontend065/old backendc1: five actual API200 field
schemas and two dummy bearer-document200 observations. Session metadata has no
raw session key; public profile/author have no email/auth fields. Both documents
have no-referrer;68 classified requests contain no downstream dummy-token URL or
Referer. One automatic verification POST is intercepted400; real writes0,
page errors0, expected400 console. Required initial links are excluded from leak
checks; their dummy query remains after controlled failure. Own public profile
is requested as its owner. This bounded packet does not close global section76.

Actual auth/me and sessions lack Cache-Control; current source also lacks the
policy. Current-dependency isolated Django tests reproduce three missing headers
(me/sessions/own profile), while session status passes. A dedicated API-only
middleware after Django authentication snapshots user state before/after DRF
and adds private,no-store. Logout, restored pending-deletion sessions,403/404,
304, ordinary login and explicit cache-header merging are covered; validators,
anonymous and static response behavior remain coherent. Thirteen new cache+
33 account tests pass; the combined cache/account/observability/client-error set
passes77. Ruff/scoped mypy/diff-check and independent review pass. Earlier broader
SQLite run has57 passes/two existing PostgreSQL advisory-lock failures; it is not
a PostgreSQL gate. Exact new source CI/runtime are still required.

Source sink tracing finds no active application logging bypass, but Django's
inherited django/server handlers and Next development incoming-request logging
bypass privacy controls. Installed Django's actual WSGI/request logging test
reproduces dummy token/email/password output. Explicit django and django.server
handlers now use the existing JsonFormatter without propagation; the subprocess
regression retains logger/severity/status without dummy secrets. First combined
run has76 passes/one Gunicorn child-settings harness failure; only the private
bootstrap is repaired, then all77 pass. No production-source fallback or test
filter is introduced. Old stale-venv21-pass/16-failure comparison is preserved:
current runtime37 passes, with installed DRF parser code explaining raw-body
handling differences. Old failures have a summary, not an invented filesystem log.

Next16.3.8 bundled logging guide supports logging:false. Before two anonymous
HTTP GET200 dummy recovery links, dev output contains UID/tokens; after actual
config restart/health200 two GET200 links emit none. First after attempt occurs
during restart and gets two HTTP errors; excluded from PASS. This probe has no
browser, mutations or real credentials. Full Node22 lint/types/589 tests in43
files pass. Independent logging review passes. Section55 local password/token
logging bullets are checked:807/335; verdicts58/40/six N/A/one deployment-only.
These application/framework/proxy controls do not promise external-provider logs.

Standalone RegisterPage actually renders RegisterForm without onRegistered,
so its verify-email?email= fallback is reachable. Dialog registration already
retains email in memory. The user is asked whether standalone resend should use
temporary tab state or ask email again; no implementation choice is silently
applied. Section55 sensitive-query remains open, as do CSRF copy, seven other UI
choices, native capabilities and real deployment. New cache/logging changes still
require an exact-source CI and configured-image verification before release.

A bounded registration observation after the verified Next config restart still
reaches HTTP200 but not field readiness within the unchanged15s gate. All three
fields remain disabled with correct credential metadata; console/page errors and
writes are zero. Payload/retention/overflow are not reached. The separate hashed
proof is retained externally; no causal attribution or further replay is made.


### 2026-10-08 — Exact b77 backend gate catches logger-capture assumption

[CI37768566296](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37768566296)
for b77f1d7f2943b6be85523c77ae6bf4b578d53e0a has401 backend passes and one failure
in test_unhandled_api_error_is_logged_and_hidden_from_public_response. Its root
caplog handler no longer receives Django records after intentional propagation
is disabled. Captured stderr nevertheless contains a safe django.request JSON
ERROR/status500 with exception locations, while the response hiding checks pass.
This failure remains part of the record; no same-source retry is used. Production
formatter/propagation policies remain intact. The test must attach its capture
handler to the actual named logger and remove it afterward, retaining the500,
correlation, secret hiding and explicit logger/severity assertions.

Both local immutable b77 production images build successfully. No migrations
change relative to the existing a3 schema, and migrate --check passes read-only
against the isolated fixture PostgreSQL. This backend image uses local development
settings; no target production configuration/provider verification is claimed.
No browser runtime is switched from these build results alone.

The same isolated current-dependency test reproduces FAIL before correction.
After explicit named-logger capture with finally cleanup, the combined
cache/account/observability/client-error/unhandled set passes78 in4.83s;
Ruff/diff-check and scoped mypy pass. The test now also requires django.request
specifically. Its source SHA211f3b3c1bd983637d2b34492a0550701b12cd63ed20a2e2d2814a999b1183b1
and raw fail/pass logs are retained externally. Exact CI for the corrected test
is still required. Subsequent source supersedes the failed run; workflow
concurrency may cancel its still-running smoke job, which is not a smoke PASS.


### 2026-10-08 — Exact a2 optimized registration, report and cache packet

Both immutable source a2c2d6f54b690f730c1186c1eb739ef414437e7c images build and run:
frontend30aaa7aa7075161e521a14d878ca8c267506109391ec3c7ade838460ed0e3d46,
backend3c109c6bb13baa3ad98ae397c4385990bfdc6f340b83ae05b0fdcef16f6a4226.
Builder release, runtime release and OCI revision match a2; frontend has no
mounts, backend only the owned media volume. Read-only migrate --check passes;
no migration changes since the existing a3 schema. Frontend health and backend
live/ready return200. An initial wrong /api/v1/health/ probe returns404; the
inspected live/ready routes correct the harness, not the application. Backend
runs Gunicorn from the production image using local development settings with
DEBUG, fixture PostgreSQL and S3 disabled; no target/provider claim is made.

The [existing native artifact](artifacts/native-form-keyboard-2026-10-08.json)
adds initialized standalone registration390 with the unchanged15s gate: native
three-field dummy input, exactly one controlled400, payload and retention3/3,
re-enabled button and no overflow. Guest390 and registered390/1710 retain the
player grid; registered Report remains open after600ms, keeps the grid, fits the
viewport, uses rgba(0,0,0,0.46) and closes by Escape. Root inspected both screenshots;
the approved paper/border/shadow treatment is consistent without clipped controls.
This does not prove every UI/control/device or pre-hydration SSR behavior.

Six real API GETs to candidate backend18585: authenticated me/sessions/profile
return200 and private,no-store; anonymous me/sessions401 and public-profile200
retain their prior cache policy. Only field names are retained. Register1 and
analytics3 POSTs are intercepted before backend; real mutations0, page errors0,
expected controlled400 console only. Owned browser/proxies close and disposable
container is absent. Raw proof/script/log/screenshots are retained externally.
Earlier dev disabled-field observations remain unexplained; optimized PASS does
not establish a causal logging/restart fix. No blanket native manager, global
network or product-readiness verdict follows.

The corrected [a2 CI37769102508](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37769102508)
backend job passes402 tests in105.73s on Python3.13.16/PostgreSQL, and frontend,
foundation and secrets jobs pass. Remaining image/smoke/live jobs are still
running at this observation. Failed b77 backend401/1 remains archived; its still
running smoke is automatically cancelled by unchanged workflow concurrency when
a2 arrives. This is a new-source gate, not a same-source retry or a smoke PASS.
Checklist remains807/335 and58/40/six N/A/one deployment-only.


### 2026-10-08 — Complete corrected a2 gate

[CI37769102508](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37769102508)
completes all nine jobs successfully for a2c2d6f54b690f730c1186c1eb739ef414437e7c:
402 backend105.73s on Python3.13.16/PostgreSQL,589 frontend/43 files,
372 smoke/12 intentional skips17.3min and123 live8.2min; foundation,
full-history secrets, both production images and Release pass. No flaky summary.
Raw checkout merge33a8aaf58bb15f11577019a14c9315d936455050 has complete tree
15a3af87976ca42bc80a24dc2174c1efeb0414ec, equal to branch a2; raw checkout log,
GitHub Git API and local git verify the comparison. Complete2,067,028-byte log
and metadata remain in external task scratch. No retry, assertion, timeout or
logging privacy policy is weakened. The earlier b77 failure and cancelled smoke
remain separate. The exact local optimized packet retains its explicit backend
fixture-settings boundary. Checklist807/335;85 unchecked are N/A,250 applicable;
58 verified/40 partial/six N/A/one deployment-only. No deployment or final product
readiness is inferred from this passing gate.


### 2026-10-08 — Known admin URLs enforce permissions; exact documentation gate

On configured a2 backend image, four actual GET requests to `/admin/` and
`/admin/accounts/user/` as guest and existing active nonstaff user return302 to
login with redirects disabled and empty response bodies. Actual account API
checks establish guest401 versus authenticated200; read-only session metadata
confirms the latter has neither staff nor superuser privileges. No auth/admin
writes or new sessions were performed.

An existing active staff superuser makes three actual GETs to the report
changelist: first page, controlled special-character search and out-of-range
page. All return200 with search/changelist/paginator structure and private
no-store headers; the dummy search is retained correctly. All have no result
table, so populated multi-page pagination and row rendering are unverified.
Backend settings are local development fixture settings, not target production.

Installed Django5.2.17 AdminSite checks active/staff status on the publicly known
admin route. Existing tests in the402-test passing gate reject suspended staff
login, deny hard deletion even to superusers, require moderation confirmation,
record audits, and reject unbounded/oversized bulk moderation. Independent review
of these results and the remaining section87 bullets supports its local verdict.
Only the obscurity bullet changes:808 checked/334 unchecked, including85 N/A
and249 applicable unchecked;59 verified/39 partial/six N/A/one deployment-only.
Target access controls and a blanket admin security audit are not claimed.

[Documentation-head CI37771826483](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37771826483)
for d330dd5 completes all nine jobs successfully. Backend402/103.21s and
frontend589/43 files pass, as do smoke/full-stack, both images, foundation,
full-history secrets and Release. Raw checkout identifies tested merge
f419fae2a53d85f6818407275e0a6e3fdd9c2aed; GitHub Git API and local Git agree
on full tree084292971420002d40727b6f169ad8195601482c. This docs-only head has
unchanged application/test source from a2; configured runtime remains a2.

Raw sanitized admin packets/scripts and complete CI log are preserved in the
external task evidence archive. No new repository plans, deployment, promotion
or interface decisions accompany this update.


### 2026-10-08 — One RSC flow reaches JavaScript EOF despite CDP aborts

One anonymous Linux Chromium Discover-to-public-card flow on exact a2 waits10s
before one click and freezes evidence before cleanup. CDP records17 RSC requests:
8 finished and9 HTTP200 ERR_ABORTED/canceled, none pending. Seven abort while
idle, one is the clicked non-prefetch navigation, one is a subsequent prefetch.
The destination grid becomes visible about301ms after click. No page or console
errors occur; two analytics POSTs are intercepted and backend writes remain zero.

Passthrough instrumentation associates all17 response bodies and readers. All
reach done:true with40 fulfilled reads, zero read rejection and zero observed
cancel/controller/signal hooks. The clicked navigation consumes13,364 bytes.
Independent source review confirms the installed production React Flight decoder
reads until EOF; grid readiness alone would have been insufficient. Installed
Next queue cancellation does not abort fetching, and its server-side unclosing
stream utility does not transform this browser response path.

All17 CDP/fetch pairs have unique temporal candidates within2ms using route and
epoch data, without relying on independently numbered public-route labels. This
is temporal correlation rather than a shared native request ID. Proxy forwarding,
Playwright routing/cache effects, settlement observers and unassociated stream
reads remain capture limitations. Complete JavaScript body consumption is proven
for this packet; the reason CDP reports aborts is still unproven. No benign-abort,
global network pass or checklist closure follows. No prefetch workaround or
additional RSC browser run is justified by this packet.

The initial harness import failed before any browser/proxy/navigation started.
Its log is retained; correcting NODE_PATH permits exactly one actual flow.
Cleanup reports zero errors and the disposable container is absent. Sanitized
raw proof, correlation, script, logs and cleanup are archived outside the repo;
the existing RSC artifact stores their hashes and bounded summary.


### 2026-10-08 — Map completed local final actions without repeating the gate

The original section105 requests actions as the environment permits. Its first
nine action bullets now map to actual results: fresh CI npm ci/backend locked
installs; frontend/backend lint and types;402 backend,589 frontend,372 smoke
with12 intentional skips and123 live tests; Next and both production image
builds; exact a2 optimized local runtime; the named live20-page-route case;
tracked-source leftover searches; and configuration/environment inspection.

The complete a2/d330 logs prove command execution and results, not just test
counts. The live major-route scenario in live-product-flows.spec.ts:2704 covers
18 guest routes plus authenticated profile/notifications/create at320/1710.
It passes in both gates. Exact a2 frontend has no source mounts and responds200;
backend Gunicorn live/ready respond200 with development fixture settings.
These scopes differ: the route pass uses the full-stack development images,
and the exact optimized browser packet has fewer flows. Configuration evidence
includes actual Compose/Nginx checks,17 frontend environment tests and10 backend
production-configuration tests; target provider settings remain unverified.

A current a4 tracked-tree search covers loopback/TODO/FIXME/mock/test-credential/
secret/debug categories and saves only counts and filename-list hashes. Matches
are retained as context-dependent findings, not proof that all leftovers or
secrets are absent. Production guards and existing scoped inventory distinguish
development/QA markers. The current secret CI job passes independently.
The corrected inventory uses literal-character regex classes; its earlier
escaped version is retained separately. Independent review supports all nine
local action marks. Checklist817/325 includes85 N/A and240 applicable unchecked.
Section105 stays partial; verdicts59/39/six N/A/one deployment-only are unchanged.
The subsequent deployment sequence and Definition of Done remain open.

### 2026-10-08 — Missing long-input packet exposes mobile active-filter overflow

One exact-a2 Linux Chromium packet runs28 cases at320/1710:21 pass and7 remain
unverified. Fourteen auth/account cases retain254-character email and/or
representative100-character passwords after controlled400 responses; shown and
hidden password states fit. Six reply/edit/report cases retain2000-character
text and fit. Wide Explore passes80-character title/author and15 tags of50 each.
Mobile Explore form fits, but its17 active-filter buttons cause document
overflow. Root visual inspection confirms long labels extend beyond the right
edge; the user is asked to choose full wrapping or ellipsis. No UI change is
applied while that choice is pending.

Guest nickname50 and editor image-alt160/bulk text100 fit initially at both
widths, but their six post-rejection checks fail at an alert visibility assertion.
Retained values after rejection are not proven by those failed checks. The
packet records only the first assertion line, so it does not establish whether
feedback is absent, the locator is ambiguous, or another condition caused the
assertion failure.

All44 observed mutations are intercepted, guard backend writes are zero, page
errors are zero, and cleanup has zero errors.32 console-error events remain;
message text was not captured, so their exact cause is not established. This
is controlled-response layout evidence, not persistence or a clean-console
verdict. Four narrow/wide Explore/Report screenshots, script, raw proof and
cleanup are archived outside the repo; the existing native artifact stores
scoped results and the proof hash. Section7 long-layout remains unchecked.

Two separate anonymous direct-backend GET measurements return catalog200 with
9054 bytes/two boards18 preview cells, and largest returned detail200 with8838
bytes/3x3 board. Both use identity transfer despite requesting gzip. Detail
preview and revision cell arrays are equal; preview contributes3473 canonical
JSON bytes, around39% of that detail. These are small sparse fixtures: the
default24-board page,10x10/media workload and target ingress compression remain
unverified. No oversized-response defect, optimization or global network mark
follows from these measurements.

The user confirms that no production domain or hosting is planned yet. Provider
alternatives and a budget question are presented; no provider is selected and
no purchase/deployment occurs. Existing interface choices remain pending.


### 2026-10-08 — Six retained-value diagnostics identify an assertion ambiguity

One six-case diagnostic preserves the original global alert assertion,400
fixtures and timeouts. All six original assertions still fail: Playwright
reports a strict-mode violation because it finds application feedback and
Next's shadow-DOM route announcer. Installed Next app-router-announcer.js
creates that role=alert shadow element. A document-only alert inventory misses
it; the full sanitized Playwright failure retains both matches. This is a
proven locator ambiguity, not proof that application feedback is absent.

Independent observations establish all six POST/PUT400 responses completed,
the intended controlled-error feedback is visible, nickname50/image-alt160/
bulk text100 are retained exactly, both selected bulk cells retain100, and
before/after document and panel geometry fit with reachable controls at320/1710.
Guest auth/me is not requested; observed session/header/form state stays stable.
No source, mock-envelope or timeout change is used to obtain these observations.
The original28-case packet remains21 passed/7 unverified; this separate packet
resolves the six missing property observations without rewriting its failures.
Mobile active-filter overflow and its user choice remain open.

Eight observed mutations are intercepted, backend guard writes are zero, page
errors are zero and cleanup succeeds. Six console-error events retain unknown
exact causes. No persistence, physical-device or clean-console verdict follows.
Sanitized proof/script/log/cleanup are archived; the existing artifact records
its hash, six independent observations and six unchanged failed assertions.

### 2026-10-08 — Exact a4 documentation gate completes

[CI37774879912](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37774879912)
for a4c5fb74f110c396f27100f6eac0d3366647e657 passes all nine jobs:402 backend
in104.94s,589 frontend in43 files,372 smoke with12 intentional skips in18.4min
and123 full-stack in6.3min. Both production images, foundation, full-history
secrets and Release pass. Raw checkout identifies merge
0f00578db345e19bd3265cd842e2a33c7a85d58e; GitHub Git API and local Git agree on
complete tree9462cad5186e138b2ea30d698b1cb1ef2fe1d2ef. Application/test source
remains identical to a2 and configured local images remain exact a2. No
additional application test rerun or image replacement is performed for these
documentation-only changes. Complete raw log and job metadata are archived.


### 2026-10-08 — Long-content verdict corrected against the observed failure

Independent review maps the exact-a2 mobile Explore active-filter overflow to
the original section26 relevant-field wrapping and overflow requirements.
Those two marks are reopened and section26 returns to Partial; prior scoped
long-content observations remain valid. Permitted80-character title/author and
15 tags of50 characters are within the product limits. The pending user choice
of wrapping or ellipsis does not resolve the observed defect. This packet does
not establish a temporal layout shift, so the separate layout-stability mark
is not automatically removed. No application change or test rerun occurs.
Current counts are815 checked/327 unchecked, including85 N/A and242 applicable;
section verdicts are58 verified/40 partial/six N/A/one deployment-only. Earlier
dated counts remain historical observations, not the current snapshot.


### 2026-10-08 — Exact e57 documentation gate completes

[CI37777997102](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37777997102)
passes all nine jobs:402 backend in100.95s,589 frontend in43 files,372 smoke
with12 intentional skips in12.3min,123 full-stack in7.8min, foundation,
full-history secrets, both images and Release. Raw checkout identifies merge
9f85c085c21e24bef5cac2d2e97956e2efe821f3. GitHub commit API and local Git agree
on complete treee70fc3bef993e410299b785e59f90a5dd2667e2f for the tested merge
and branch e57de315277dbd5063b983f5ce397c3ce438a036. Raw log and completed-job
metadata are archived outside the repository; watcher exits0. Application
source remains a2 and configured local runtime is unchanged. This is the
committed e57 gate, not a gate for subsequent uncommitted documentation edits.


### 2026-10-08 — Three player loading observations expose an early registered shift

One exact-a2 Linux Chromium packet observes guest390 and registered390/1710,
with init-script buffered layout-shift sources and continuous frame geometry.
Both registered progress GETs are owned main-frame fetches, held1063/1060ms,
then released to real200 responses with completed bodies. The seeded board
is present and visible in all63/64 held frames. All three flows complete.

Last-pending to first-ready header/title/actions/board rectangles are unchanged,
but this excludes earlier movement. First-pending to ready registered390 actions
grow54px in height; at1710 title width falls166.828125px/height grows64px, actions
widen166.828125px and board moves down88.34375px. The action-child inventory grows
from four to five during pending. Source review finds that BingoPage does not
provide initialAuthorProfile; player starts with no author profile, fetches it
independently, then adds Follow/Following. The intrinsic-width actions column
then reduces the adjacent heading width. The button insertion and reflow occur
in the same recorded frame, providing strong source/frame attribution; the
profile GET itself was not recorded by this harness. Header movement separately
matches RootLayout passing only the server user ID while AppHeader starts with
no user and later adds Notifications. Treatment remains pending; the global
section5 mark stays open. Registered CLS maximum session values are0.00539532764 and
0.03427796284; mobile sum is0.00608092058. Guest repeats0.00068559295, but its
reported source has no tag and equal previous/current rectangles, limiting
attribution. Guest measured rectangles stay unchanged.

Only three telemetry POSTs are intercepted; business writes, page/console/proxy
errors and observer overflows are zero. Cleanup succeeds and the disposable
container is removed. Raw proof, offline summary, script, preflight and cleanup
are archived outside the repository; the existing artifact records their scope.
No physical-device or global layout-stability verdict follows. No source or
UI change and no rerun occurs.


### 2026-10-08 — Header seeding and accepted empty Follow reservation

The working-tree patch passes601 frontend tests in43 files/17.32s, full ESLint
and TypeScript. Header tests cover server markup, pending client revalidation,
expiry, logout, account switches and obsolete responses/props. Independent auth
review finds no meaningful findings: only id/display_name/avatar cross the new
server/client boundary, initial state is mount-only, and existing response
versions/session lifetimes stay unchanged. The optional Follow profile retains
independence from progress. The user explicitly chooses empty reserved space;
two hidden non-focusable labels size one shared grid cell for Follow author and
Following, retaining the space after an optional profile error. Player tests
cover both labels, pending/error behavior, guest/author exclusion and logout
followed by a stale profile response. Independent code review passes.

Worker-reported fail-before results are two header variants and three missing
Follow-slot cases; root directly observes the complete601-test result and
archives its raw log. The earlier exact-a2 browser packet remains the measured
before state. Current optimized-image browser geometry and exact-source CI
are pending; no global layout mark or section verdict is promoted.


### 2026-10-08 — d8 source gate stops at formatting

[CI37781920465](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37781920465)
for d8fe89ac42613938ef65801b23a4a07b98264dd2 fails the frontend formatting
step for features/play/bingo-player.test.tsx. Backend, foundation and full-history
secret jobs pass; browser/image jobs are skipped and Release fails. This is not
a complete source gate. Raw failed-job output is retained outside the repository.
Prettier changes only a three-line querySelectorAll call to one line; assertions
and application files are unchanged. The full frontend format check then passes.
The earlier601-test result retains its tested scope; the corrected source gate
and built-image geometry remain pending. No failed/skipped job is counted as a
pass and no assertion or timeout is changed.

### 2026-10-08 — Accepted Follow reservation measured in the d8 image

One seven-context Linux Chromium packet checks guest390 and registered390/1710
with real unfollowed, controlled following and controlled503 author profiles.
The actual frontend is d8fe89a/image945ce4d8232c6417865f73de66116a876e60afe32140cbca3a1d69e6e6af62ee;
backend remains a2. Reviewed checkout cca43db differs only in test formatting and
documentation, with application files unchanged; the runtime is not relabeled.

All six registered observations complete geometry/accessibility checkpoints:
real progress200 finishes and play is ready before the optional profile is
released. Empty sizing slots are inaccessible and non-focusable, both button
labels fit their reserved bounds, and error slots remain blank with play enabled.
Header, slot, actions, heading and board rectangles have zero measured change
before/after profile completion and from the first board frame to final state.
Guest has no slot; no captured document overflow occurs. Mobile CLS0.00068559295
attributes to a text node inside P.progress-status with equal reported rectangles;
wide CLS is0 in this bounded capture. This is not a global zero-CLS verdict.

The packet result is six successful scenarios and one failed console assertion.
Registered1710 controlled503 independently records a real auth/session GET500
and an unexpected console500. The console collector retained only whether its
location exactly matched the profile URL, so direct console-to-session association
and the server cause are not proved. Both intended profile503 console messages
are precisely attributed and retained separately. No rerun or weakened assertion
occurs. Ten observed telemetry writes are intercepted; business writes, page
errors and harness-proxy errors are zero. Cleanup succeeds and container removal
is checked; the later service-log inspection below covers the application proxy.

Subsequent read-only service-log inspection finds Next.js failing to proxy the
same session route with socket hang up/ECONNRESET at13:15:43.326488637Z, roughly
6.5ms before the recorded500. Backend logs are empty in the retained window;
its container has no restart or OOM evidence. The upstream connection reset is
established, but its deeper cause and a backend HTTP500 are not. The controlled
profile503 is later and separate. Sanitized findings and raw logs are archived;
no replay or service change is used to dismiss the failed scenario.

Raw proof, scripts and offline summary are archived outside the repository;
the existing native-form artifact adds the scoped playerLoadingGeometryD8 result.
Section5 and the corrected source gate remain open.

### 2026-10-08 — Seeded header unread-count revalidation

Source review exposes a consequence of header seeding: the initial public user
starts an unread-count request, then successful session revalidation supplies a
new same-account object and the old object-dependent effect fetches again and
resets the badge. A failed second request can leave a previously known count at0.
Two new tests fail before the correction. The effect now depends on the account
ID and an explicit event refresh revision. Bootstrap/path session completion
does not duplicate the count request; focus, auth events and persisted pageshow
retain freshness. Optional refresh errors retain the known count, while logout
and account changes clear it; active-effect/current-account checks reject stale
results. Eight new cases and the existing prior-account case cover these paths.
All609 frontend tests in43 files pass locally/19.16s and full ESLint passes;
independent correctness review finds no meaningful issues. Full TypeScript and
format checks also pass. This source correction is later than the d8 image packet;
the d8 packet is not relabeled as proving it.

The subsequent optimized0224870 image has matching built/runtime release,
non-root user, no application mounts and health200. One approved two-context
Linux Chromium packet at390/1710 passes: each seeded header makes exactly one
startup unread GET, then two synthetic focus events refresh7 to9 and retain9
after a controlled503. All three real same-account session responses return200
and finish; real unread200 backing bodies are read only in memory before supplying
controlled counts. Header/account/link rectangles remain unchanged and no page
overflow occurs. Each context has only its exactly attributed expected unread503
console error, with no unexpected console/page/route errors. Four telemetry writes
are intercepted204; no business writes occur. Cleanup succeeds and the container
is absent. Native OS focus and target services are not covered. Raw proof/scripts
and masked header screenshots are archived outside the repository; the existing
artifact adds headerUnread022. Exact-source CI is still pending; no global
duplicate-request or layout checkbox is promoted.

### 2026-10-08 — Actual plain-text MIME contract for account emails

Ten new cases exercise both verification purposes, password reset, both direct
notice senders and all five persisted security/deletion notice variants. The
actual locmem message is serialized and parsed as transport MIME: text/plain,
UTF-8 payload round-trip, no multipart or HTML alternative, configured From,
intended recipient/current subject and exact public action/support URLs. A
non-ASCII name/security body verifies encoding. This verifies each emitted format,
not every enqueue/recovery route. Independent coverage review finds no meaningful
gap for the original plain-text requirement. The complete email file passes25
cases/2.73s in locked Python3.13.15/Django5.2.17/DRF3.17.2 with network disabled,
read-only source and in-memory SQLite; Ruff lint/format and diff checks pass.
An earlier stale host-venv attempt failed at PostgreSQL setup and is not counted
as a product result. No message reaches SMTP or a provider.

Only section45 plain-text fallback is checked: current emails are plain-only,
with no HTML requiring an alternative. Production sender/domain authentication,
delivery, inbox/mobile/dark rendering and operator choices remain open. Source
review also corrects the tracker’s overbroad branded-subject claim: several
security subjects lack a brand; the copy choice is pending with the user.
Counts become816 checked/326 unchecked, of which85 are N/A and241 applicable;
section verdicts are unchanged.

### 2026-10-08 — CCA smoke reaches the job limit; independent project jobs

[CI37782590752](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37782590752)
for cca43db passes frontend601/43 files, backend402/105.64s, foundation,
full-history secrets, both production images and123 full-stack flows/8.0min.
The smoke job is cancelled at its existing20-minute limit:384 planned,352
passed,12 intentionally skipped and20 without completed results. No failed-test,
assertion, locator, test-timeout or retry records occur. Chromium completes96,
mobile/firefox each92+4 skips; WebKit completes72+4 skips before cancellation.
Release fails, so this is not a complete source gate. Tested merge
968816484001dc92407d9b0679930e133044b2c0 and branch cca share full tree
22cf896b7e6fb46f138e5420276f4c4cf6f1a276. An initial log download fails with a
connection reset; a recovered full log and separate smoke log preserve the result.

Independent execution-cost review finds no cross-project smoke fixture or order
dependency. CI now selects each of the four existing projects in a separate job,
retaining one worker, existing timeouts/retries/assertions and all384 discovered
cases. Distinct artifact names avoid report collisions; fail-fast false retains
sibling results. Release still requires aggregate e2e success. This follows
[GitHub’s matrix-job contract](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations).
Actionlint and discovery-only listing pass; independent workflow review passes.
Improved elapsed time remains a hypothesis until the new complete CI runs.

### 2026-10-08 — Remove unused full preview from detail responses

Frontend consumer tracing finds that player, metadata, editor and recovery use
current_revision; BingoDetail.preview has no runtime consumer. Catalog cards
still need their preview. The detail serializer now omits only this duplicate;
OpenAPI, generated frontend schema and the explicit detail type change together.
This intentionally changes the predeployment detail API contract and is not
claimed backward-compatible for unknown external clients. Retrieve and shared
publish/archive/restore responses retain the full revision; catalog previews stay.

Two regressions fail before on unexpected preview, then36 scoped backend cases
and64 frontend cases pass. Worker observes actual uncompressed detail bytes for
a populated100-cell board falling81,601→41,563, saving40,038/49.06%; this is one
representative response, not a global network or latency result. Root reviews the
source/schema/test diff, and independent correctness review finds no issues.
Root’s final frontend check passes609 tests/43 files/17.36s, full lint/types/format;
backend Ruff and schema validation pass. Final exact-source CI and updated-runtime
checks remain pending. Catalog page-size/maximum-cell payload remains a separate
performance question; section76 is not closed by this detail correction.

Root also runs the combined email/API-boundary/draft-revision suite against the
locked network-disabled SQLite test runtime:61 pass/8.38s. Full backend Ruff
check/format pass. This combined local result does not substitute for the required
Python3.13/PostgreSQL complete source gate.

Both exact5f28e03 optimized replacement images build and run with matching
release labels, non-root users and baked source. Frontend built release/origin
match the configured values. The isolated frontend/backend live-health GETs
return200. Four real guest/registered API GETs confirm detail has no preview and
retains all nine revision cells, while both catalog responses retain preview
fields for the same two fixture boards. Guest detail is5,354 bytes and registered
detail5,351; catalog is9,054. Authenticated responses retain private, no-store.
Backend keeps development settings and its existing /app/media data volume;
there are no source bind mounts. An initial preflight incorrectly forbids that
data volume and stops before HTTP; the corrected guard explicitly preserves it.
This is recorded as a harness correction, not a product pass. Build/runtime/API
proofs are archived outside the repository. The complete exact5f28e03 source gate subsequently passes as recorded below;
target production configuration remains unverified.


### 2026-10-08 — Complete four-project source gate for5f28e03

[CI37786669037](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37786669037)
finishes with all12 jobs successful for5f28e0312eba22f5a1741c896ea9a9216ea386a4.
Backend passes414 cases/81.21s on Python3.13/PostgreSQL; frontend passes609
cases/43 files. Chromium passes96/4.2min; mobile92+4 intentional skips/2.6min;
Firefox92+4/4.8min; WebKit92+4/6.3min. Aggregate smoke is372 passed/12 skipped,
all384 planned cases accounted for. Full-stack flows pass123/8.7min. Foundation,
full-history secrets, both production images and Release also pass. These are
test execution times; job setup and teardown add time. Existing assertions,
workers, retries and timeouts remain unchanged.

Tested merge cbd2e1c7a0e0cdb7c4ccf6b5e95200ce8e892764 has full tree
3ca5954401762e8cd3bbf0f5e39a22a89b530d00, identical to branch5f28e03. Raw log,
job metadata and tree proof are archived outside the repository. The earlier CCA
job-limit cancellation and d8 format failure remain recorded. This complete gate
covers the header, Follow reservation, unread-count and detail-preview changes;
it does not cover the subsequent uncommitted slim-preview-media patch. No target
deployment, native device or unexplained-session500 requirement is closed.

### 2026-10-08 — Maximum-field catalog payload before slim preview media

An isolated locked-runtime probe publishes100 independent10×10 boards after
input serializer and publishable-document validation. Each has100-character
cell text,160-character image descriptions,70-character title,1,000-character
description and15 tags of50 characters, using multi-byte Unicode. Normalized
input is150,418 UTF-8 bytes under the524,288-byte document limit. The corrected
fixture shares100 ready cell images plus cover/background/avatar and thumbnails
across boards. It measures actual anonymous, uncompressed JSON responses for
exact5f28e03: default24 cards5,140,890 bytes; explicit24 cards5,140,903;
100 cards21,420,053; requested101 is capped to100 with the same byte count.
Detail has100 full revision cells, no preview, and224,635 bytes. One isolated
SQLite test passes/28.78s; this confirms response bytes for this fixture.

An initial distinct-media fixture fails before measurement with SQLite expression
depth1000 while prefetching2,400 distinct cell image references for the default
page. This is not a PostgreSQL result. The raw initial failure log was replaced
by a sanitized summary; only that summary and first_failure metadata remain.
The shared-media correction preserves per-board content maxima but does not
verify distinct-media query scalability. This is a representative maximum-field
shape, not an absolute response ceiling, production compression or latency proof.
Section76 remains open; unused nested media metadata is addressed separately.


### 2026-10-08 — Retain rendering fields while slimming catalog media

Nested preview cell images and board backgrounds now serialize only id, width,
height, url and thumbnail_url. Full detail/revision/upload/cover/avatar media keep
17 fields. All19 cell fields, complete text/image descriptions and styling stay;
the frontend renderer changes only its type annotation. Shared URL and thumbnail
readiness methods remain unchanged. This intentionally changes the predeployment
card-preview API contract; unknown external-client compatibility is not claimed.
OpenAPI and generated TypeScript schema update together with the explicit types.

A valid fail-before regression observes17 media keys rather than five. After the
patch,46 focused backend cases/6.23s,10 card cases, typecheck, targeted lint,
Ruff and schema validation pass; root's final frontend lint/types/full suite
passes610 tests/43 files/17.19s and full format passes. Independent correctness
review finds no blocking issue. Initial fixture setup and expected
trailing-whitespace normalization corrections are test preparation, not product
failures. Schema generation uses network-isolated PostgreSQL metadata so unrelated
SQLite integer-limit drift does not enter the committed contract.

Root reviews one AFTER script using a tracked backend snapshot of base5f28e03
and diff SHA256 a6cc40188816dc4791e5ab4d662b76acf256f6c1dd37e21ca3f6e1438ed2de4f.
The same shared-media100-board fixture runs once: one test passes/15.16s.
Default24 cards fall5,140,890→4,246,290 bytes; explicit24 falls
5,140,903→4,246,303. Requested100 and capped101 fall
21,420,053→17,692,553. This removes894,600 bytes per24-card response or
3,727,500 per100-card response, approximately17.40%. Detail remains224,635
bytes. Assertions retain all100 validated/published boards, all19 cell fields,
full text/image descriptions/style and full media descriptors outside preview.

Logs, comparison, snapshot diff and final execution status are archived outside
the repository. The original preparation manifest remains prepared-only; a
separate execution record identifies the single passing run and verified diff.
Responses remain large. Shared-media SQLite timing is not a benchmark; distinct
media/PostgreSQL query cost, actual ingress compression and target latency remain
unverified. The existing Nginx configuration enables gzip for application/json,
but this uncompressed serializer measurement does not execute that ingress.
No section76 bullet or global performance verdict is promoted. The exact new
committed-source complete gate remains required.


Both exact5ed50c0 optimized images subsequently build and run non-root with
matching full revision labels and configured frontend built release/origin.
Frontend and backend live-health responses are200. One four-GET runtime check
returns200 for guest/registered detail and catalog: detail retains nine revision
cells without preview; both catalog responses retain two board previews and all
19 cell fields. Authenticated responses remain private, no-store. Detail bytes
are5,354/5,351 and catalog9,054, unchanged for this sparse fixture. No non-null
image descriptors exist in that fixture, so it does not verify nested five-field
media; the isolated populated probe and focused API cases provide that proof.
Backend keeps development settings and its existing /app/media data volume;
there are no source bind mounts. Only candidate frontend/backend image/release
configuration changes; other workers and data are retained. Build, immutable
image, runtime and API artifacts are archived outside the repository. The new
complete source gate remains pending; no target deployment is claimed.


### 2026-10-08 — Complete exact-source gate for slim catalog media

[CI37790158585](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37790158585)
passes all12 jobs for5ed50c0f02ffeac9a4ac3d0f4caa75f6de1ca14c. Backend passes
423 cases/61.38s on Python3.13/PostgreSQL; frontend610/43 files. Chromium passes
96/4.1min; mobile92+4 intentional skips/2.7min; Firefox92+4/4.4min;
WebKit92+4/6.2min. All384 smoke cases are accounted for:372 passes/12 skips.
Full-stack passes123/8.9min. Foundation, full-history secrets, both production
images and Release pass. Execution times exclude setup/teardown.

Tested merge221cfd7f6c586cbe330fefa69ffb0ac450c90ae6 and branch5ed50c0 share
complete tree617595a74da44902ce838c9eddb0d6077d64804a. Raw log, job metadata
and tree proof are archived outside the repository. The populated serializer
probe and sparse exact-image runtime proof above retain their distinct scopes.
No target deployment or global response-size/session-proxy verdict is inferred.
The subsequent two shared-link failure tests cover existing clipboard rejection
and non-Abort native-share failure: readable fallback, released controls, intact
result, no provider-error exposure and successful copying after failure. Their
focused file passes11 cases with targeted lint/format. No runtime code changes;
no timed persistence/native-provider/browser behavior is established by those
unit cases. Their final committed test-source gate remains required.


### 2026-10-08 — Optional analytics UUID failure and retained browser failure

The reviewed two-context browser diagnostic terminates with zero of two cases
verified. Its HTTP host.docker.internal origin is not trustworthy: UUID support
is unavailable and PageActivity analytics throws before feedback interactions.
Actual page/API GETs return200, but copy/share controls, persistence and geometry
are not reached. Raw scripts, hashes, proof, log and successful container cleanup
are archived separately. This is a diagnostic-origin error, not evidence of a
production HTTPS failure. A separately reviewed trustworthy-origin packet is
required; the failed run is not replayed or converted into a pass.

The incident exposes a separate source defect: optional analytics event UUID
construction throws synchronously outside the existing transport catch. The
minimal guard skips the new event when UUID generation is absent or throws,
before queue insertion or scheduling. It does not synthesize identifiers or
change UI behavior. Existing valid queued events and normal batching remain.
[MDN randomUUID documentation](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)
records its secure-context requirement.

Actual-module regression tests fail five cases before the guard and pass all
seven afterward, covering missing/throwing UUID, anonymous-ID construction,
retained valid queue, twenty-event batching and storage-read denial. Independent
failure-semantics review finds no blocking issue. Final frontend lint, types,
619 tests/44 files and full format pass. Storage-write denial and actual browser
integration are not directly established by those tests. The new source still
requires its updated configured frontend image and complete committed-source CI.
No checklist item or overall readiness verdict is promoted.


### 2026-10-08 — Trusted local shared-feedback observations, network gate failed

The configured frontend is rebuilt from exact05d148a and runs non-root with
matching built revision/origin, no mounts and health200. Backend remains actual
5ed50c0 image56bef; its identity is not relabelled. A concurrent global Docker
restart stops the rollout services before the new diagnostic preflight: that
invocation reaches zero browser contexts. The same existing services/images are
restored; separate preflight failure and subsequent invocation records remain.

One reviewed actual browser packet uses a read-only in-container localhost
proxy, without crypto mocking or insecure-origin overrides. Both320×480 and
1710×900 contexts confirm secureContext and native randomUUID, real anonymous
share API/SSR200 and no page/console/proxy/route errors. Four feedback states
in each context retain the result, show readable rejection/fallback, release
controls and permit successful copy retry. Double synchronous clicks invoke
each provider once; copy3/share1 use the current URL. Each message persists
5.1 seconds and is visible/unclipped after scrolling, with no horizontal overflow.
Providers are controlled promises; this does not verify native OS integration.

The packet nevertheless exits1: zero of two contexts satisfy the complete gate.
Strict request-failure checks retain9/13 ERR_ABORTED requests, including navigation
GETs and the controlled interactions POST. Each observes34 actual200 responses
and one synthesized204. Cause remains unassigned; assertions are not weakened
and the browser packet is not replayed. No business writes occur.

Feedback initially sits outside the visible area after the board, even when
Copy link/Share is reachable. Its subsequent scrolled readability does not
resolve that placement issue. The user is asked to choose feedback by the buttons
or a fixed bottom notice; no layout change is made pending that choice. Raw proof,
eight cropped feedback screenshots, both invocation records and successful
container cleanup are archived outside the repository. No global section97 or
network/readiness verdict is promoted.


### 2026-10-08 — Profile collection loading measurements

One reviewed two-width packet on configured frontend05d148a/backend5ed measures
actual public profile collections without adding rows. Created returns two rows;
other public collections are empty. Initial load, populated/empty tab switching,
controlled503 and actual successful retry are captured. Tabs and panel top remain
fixed; loading/empty/error panels remain260px high and held states do not drift.
Content height changes from1034→260 at320 and553.672→260 at1710, moving the footer.
Those final content differences do not alone establish an unnecessary jump or
a source bug. CLS is0.00372917/0; recent-input shifts remain separately recorded.

The complete diagnostic exits1 with two contexts/zero complete, twelve findings
and two fixture gaps: ten strict geometry-delta findings and two strict
request-failure assertions. Background/navigation/telemetry ERR_ABORTED counts
are15/14; actual collection GETs succeed. Page/route/proxy errors and unexpected
console errors are zero; the controlled503 console attribution is retained.
Actual Created has no next page, so disappearing pagination during load remains
unverified. Masked screenshots, raw proof and successful cleanup are archived.
No assertions are weakened, no replay or UI change occurs, and section5 remains
partial.

### 2026-10-08 — Withdrawn board metadata in public profile shared results

Source inventory exposes a mismatch between direct shared-result authorization
and non-owner profile collection filtering. With an old public revision/share,
the collection still returns title, share identifier/URL and selection count
after the current board becomes private, unpublished or deleted, whereas direct
share access returns404. Actual API regressions fail eight restricted cases
before the fix; four public/unlisted cases pass. The queryset now requires a
published, undeleted current board and excludes current private visibility,
retaining the existing share/revision/hidden guards and owner-list behavior.

Afterward14 scoped API cases pass, including adjacent independent privacy and
shared-result cases; Ruff lint/format and diff checks pass. Guest and unrelated
authenticated readers receive no withdrawn title/share token/count or rows.
Public/unlisted shares and owner profile listings retain their previous access.
The regression uses SQLite in memory and direct model transitions; no full
revision leak, deployed response projection, or complete section76 closure is
claimed. Raw fail-before/after logs are archived. Independent security review finds no blocking issue. Exact
new-source PostgreSQL CI/runtime verification remains required.


### 2026-10-08 — Configured privacy-filter image and bounded response projection

Exact backendb6aabca builds and runs non-root with matching revision/APP_RELEASE
and existing media-only data volume. Frontend retains its actual05d148a image
identity; its complete frontend source is identical to b6aabca, verified by Git.
No image is relabelled. Only candidate backend changes; fixture development
settings and other services/data remain. Both live-health checks return200.
Build/image/runtime artifacts are archived outside the repository.

One reviewed GET-only packet observes24 actual API and HTML documents for public
bingo, author profile, public share and private-board controls as guest, author
and player. Bodies/cookies/identities stay in memory; retained evidence contains
statuses, field paths and comparison booleans. All20 successful responses have
no fields outside the inspected allowlist, and all ten successful selected
inline-Flight projections match their corresponding API objects. Known private
board title/nine cell markers are present in both owner controls and absent from
public responses and guest/player private404 documents/API. Owner editable
drafts are permitted; guest/player public-bingo drafts are null. Authenticated
viewer projections match the requesting account's own ID/email.

The original guest viewer comparison assumes null and records false; source
returns the explicit guest sentinel. One separately recorded additional guest
document GET confirms only that sentinel and no viewer object. The original
report/script is retained, not rewritten or replayed. Independent security
review supports the bounded projection result, not every HTML field.

Hidden-bio and distinct unpublished-draft markers are unavailable. No withdrawn
share fixture or genuinely unrelated ordinary share reader exists in this
manifest; the public-share author is privileged and player is the result owner.
Progress, report/private-media responses, explicit RSC/prefetch and production
remain outside this packet. The withdrawal filter has separate endpoint
fail-before/after tests; deployed privacy transitions are not newly proved.
No global section76 checkbox or readiness verdict is promoted. Exact new-source
CI remains running when these observations are recorded.


### 2026-10-08 — Complete analytics/privacy source gate

[CI37796382333](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37796382333)
passes all12 jobs for b6aabca6050687919c2a5c0ca953bc3817eed474. Backend435
cases pass/106.89s on Python3.13/PostgreSQL; frontend619/44 files/31.32s.
Chromium96/4.0min, mobile92+4 intentional skips/3.7min, Firefox92+4/4.7min
and WebKit92+4/4.8min account for372 passes/12 skips/384 planned smoke cases.
Full-stack123/6.6min, foundation/history secrets, both images and Release pass.
Durations exclude setup/teardown. Tested merge0d92fe0f1e2dd161c6c0f4aa2f21a67330d2deea
and branch share full tree573afb87b2c952c5f632c7454ca035db0e5e3ce8, verified
from raw checkout log, GitHub commit API and local Git. Raw log/job metadata/tree
proof are archived. This does not cover the subsequent expiry-test additions.

### 2026-10-08 — Deterministic session and CSRF cookie expiry contracts

Two new tests and expanded password-rotation assertions use deliberately short
isolated overrides and an installed frozen clock, without changing production
duration. Login Max-Age/Expires match persisted expiry; authenticated reads at
30/59 seconds do not renew a60-second session. Cache naturally expires at61
seconds, and the server rejects the old credential even when Django Client
continues sending it. Password rotation after five minutes retains the original
20-minute deadline and emits the remaining900 seconds. CSRF Max-Age/Expires
are checked independently; a matching retained CSRF token has no server TTL,
while a missing token is rejected. No cache purge simulates session expiration.

Three focused cases pass. A broader SQLite attempt retains13 passes/two
PostgreSQL skips/three existing pg_try_advisory_lock failures; this unsupported
job backend is not presented as a passing full module run. The same two modules
then pass18 cases/10.65s on real local PostgreSQL, with no failures/skips. A unique
isolated test database is absent before setup and dropped afterward. Ruff and
format pass; independent test review finds no coverage/mock-realism issue.
Local Python3.14.5/Django5.2.16/pytest8.4.2 and locmem differ from project-pinned
CI/runtime. The later real-Redis probe below covers natural local cache expiry;
actual browser cookie removal and deployed host/path/duration remain unverified.
Code defaults30 days while example
configuration supplies14; the user is asked to select the final policy. No
policy or section51 checkbox is silently changed. The added test-source gate
remains required. Raw outcomes are archived outside the repository.


### 2026-10-08 — Third recovery-route downstream token leakage observation

One separately reviewed local Chromium invalid-token diagnostic covers
confirm-email-change on the configured05d frontend/b6 backend. Its nonsecret
marker is intentionally carried by the initial document; exactly one browser
and one proxy initial-document observation are excluded from downstream checks.
Actual document200 supplies no-referrer, and native secure-context UUID support
is available.34 downstream browser requests and33 proxy forwarded-read
observations contain no marker/token query in URL or Referer; no downstream
Referer is present. These are67 layer observations, not67 unique requests.

The confirmation token appears only in the intercepted POST body; its controlled
400 is displayed. No confirmation reaches the backend or changes an account.
A body-free diagnostic-only proxy POST returns405, proving nonread rejection.
The packet exits0 for leakage checks only. Twelve aborted navigation GETs and
the controlled400 console error remain recorded separately; this is not a
complete network pass or a waiver of earlier strict failures. Page/route/proxy
errors are zero and the diagnostic container is removed. Raw scripts/proof/log
are archived. Other engines, real provider/history/ingress behavior and actual
successful token consumption remain outside this observation; existing live
email-change URL-stripping tests supply separate evidence. Section55/76 stays
open for the registration-email query decision and remaining deployment scope.


### 2026-10-08 — Natural local Redis/session expiry observation

One reviewed isolated probe uses actual PostgreSQL, Django cached-db sessions
and RedisCache with a four-second real lifetime, without a frozen clock or cache
purge. Login cookie Max-Age4 and Expires agree with the durable deadline within
1.5 seconds. Initial Redis TTL4 becomes absent(-2) after4.02 real seconds, while
the SQL deadline elapses. A successful read before expiry does not renew it;
a retained expired credential then returns401 and null session user. One case
passes/8.21s. Independent test review finds no meaningful proof or isolation flaw.
Cleanup removes only three keys bearing this run's UUID prefix;
that prefix and the absent-before isolated test database are empty/absent afterward.

No existing application sessions, fixtures, services or policy change. Raw log
and reviewed runner/settings/test are archived outside the repository. The
local Python3.14.5/Django5.2.16/pytest8.4.2 differs from locked CI/runtime; this
establishes real local Redis transport/clock behavior, not deployed expiry or
native browser cookie deletion. Final production duration remains the user's
pending14/30-day decision. Test-source7534134 CI subsequently passes all12 jobs below;
application code/images retain their verified05d/b6 identities and source equivalence.


### 2026-10-08 — Request-specific CDP cancellation contrast

One read-only Chromium diagnostic collects two fresh390×900 contexts for22
seconds each on the existing shared result and configured05d/b6 runtime. LaneA
uses Playwright interception for controlled telemetry204; laneB installs no
Playwright routes and supplies204 at the proxy. Both collection contexts finish
with no safety failures, business writes, page/console/proxy errors or remaining
diagnostic container. This is collection success, not network success.

Of35 CDP requests per lane, A records21 canceled ERR_ABORTED and14 finishes;
B records15 cancellations and20 finishes. Each failed request first receives a
same-request-ID response:20/14 RSC GET200 respectively and one telemetryPOST204
each. Request-to-failure lifetimes are6–239ms; response-to-failure spans are
0.283–214.509ms, before the20-second application deadline and cleanup. No
intervening main navigation/pagehide is
observed. Failures therefore also occur without Playwright interception. All
observed RSC prefetch values are1; no2/3 or HMR flag is observed.

The precise cancellation mechanism remains unproved. Independent source
review maps the recorded RSC initiators to fetch/createFetch, not a cancellation
site. Installed Next leaves in-flight requests running when prefetch tasks are
canceled, and ordinary prefetch calls do not pass the byte limit needed for the
examined bounded-reader cancellation. Analytics has no upstream abort signal;
its20-second timer and successful204 decoding path do not explain the observed
timing. Exact deployed analytics chunk frames also map to fetch,
withRequestDeadline and performApiRequest initiation, not a cancellation site.
The packet does not record whether the JavaScript fetch promise fulfills or
rejects. These checks exclude those specific explanations without proving an
application defect or an expected browser cancellation. Proxy-to-CDP
candidate matches retain timing-race gaps explicitly instead of inventing
associations. Existing strict network failures remain unchanged and are not
waived. Raw reviewed scripts, proof and log are archived outside the repository.


### 2026-10-08 — Complete expiry-test source gate

Exact7534134 passes all12 jobs in [CI37799307071](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37799307071):
437 backend cases/99.51s and619 frontend cases/44 files/22.59s. Chromium96/3.9min,
mobile92+4 intentional skips/3.1min, Firefox92+4/4.0min and WebKit92+4/7.6min
account for372 passes/12 skips/384 planned smoke cases. Full-stack123/9.3min,
foundation/history secrets, both production images and Release pass. Test
durations exclude setup/teardown. Raw checkout records tested merge
f397a6a68d6deb87281a0189e7d6be9c33d8cefa; the GitHub commit API and local Git
agree on full treee19e28066814d3056d3f60ee4ec9d29553727aa4. Raw logs, metadata
and tree proof are archived. This proves the committed deterministic expiry
tests on pinned CI; the separate natural Redis probe has its own local version
scope. It does not prove production/native expiry or unresolved CDP attribution.


### 2026-10-08 — Bind activation starts to an actual board

A scoped source audit and independent correctness review expose a metric
validity defect: authenticated START with omitted/null bingo_id is accepted and
can activate an account without any board. Actual player first-cell events
already carry board/revision IDs. START ingestion now requires a board while
keeping revision optional; mature-cohort activation excludes historical unbound
START. Raw activity counts retain those old events. No current board-status or
deleted-state filter discards legitimate historical activation. Other event
shapes and existing board-access checks remain intact.

Before the fix, five regressions fail and five cases pass. Afterward,12 focused
SQLite cases pass; a broader SQLite run retains23 passes/four existing
PostgreSQL advisory-lock failures. The final same broader scope passes28 cases
on actual local PostgreSQL/5.97s with no skips/failures. Its unique test database
is absent before and after. Cases cover guest/authenticated omitted/null input,
no writes on rejection, valid revision-less activation, ingestion retry and
guest counter idempotency, multiple starts counting one activated account,
legacy unbound exclusion, and archived/soft-deleted board states. Historical
state tests mutate fields directly rather than executing deletion services.

Independent correctness review and Ruff lint/format pass. Raw before/after
logs and the isolated PostgreSQL runner are archived outside the repository;
credentials remain only in process memory/environment. Local Python3.14.5/
Django5.2.16/DRF3.16.1/pytest8.4.2 differs from locked CI. The report still uses
client-reported starts and cannot establish independent play persistence. The
new source subsequently passes its exactbc38a5a gate below; completed7534134
does not cover it.
Section62's real-user/deployment dependencies remain open.


### 2026-10-08 — Native fetch settlements beside CDP failures

One independently reviewed instrumented Chromium observation on FE05d/BEb6
collects one390×900 shared-result context for22.009 seconds with no Playwright
routes, business writes or forced body reads. All23 original native fetch
promises fulfill:20 route GET200, session/CSRF GET200 and one controlled
telemetryPOST204. Method/route counts match all23 CDP Fetch requests. CDP
records35 total requests,17 canceled ERR_ABORTED and18 finishes;16 failed
requests are RSC200 and one is the unique telemetryPOST204. The POST's route,
method, deployed initiator and timing support correlation with nativefetch15,
which fulfills despite the CDP failure. This does not prove real telemetry
persistence because the proxy supplies its response.

All five observation hooks install and47 events deliver. Local counters prove
no missing fetch outcomes, observer attachments or binding deliveries; no
wrapped AbortController.abort or stream/reader.cancel invocation is observed.
These observations establish header-stage promise success, not response-body
completion, Flight decoding or useful prefetch cache entries, consistent with
the observed version's [FetchManager response handling](https://github.com/chromium/chromium/blob/149.0.7827.0/third_party/blink/renderer/core/fetch/fetch_manager.cc#L738). Browser/internal
cancellation remains unproved; instrumentation changes function identity,
timing and rejection reporting. Independent source/result review agrees with
this bounded interpretation. Earlier strict failures are not waived.

Collection completes1/1 with zero collection/safety errors, but the wrapper
exits1: its case-sensitive cleanup classifier records unknown for Docker's
lowercase 'error: no such object' response. A separate read-only inspect
confirms the diagnostic container absent. Original cleanup/proof/log and
reviewed scripts remain unchanged; the supplementary absence proof is saved
separately and all raw files are archived. This does not convert the original
wrapper failure to a pass. Runtime does not cover the newerbc backend patch.


### 2026-10-08 — Bounded native Chrome availability and cleanup

The historical task-owned Chrome tab is no longer found; this is not evidence
of a locked Mac. One new task-owned Chrome tab successfully loads local
Discover, exposing project accessibility state and a page-only screenshot with
light page styling. Native inventory exposes no matching project window, so
toolbar/favicon appearance, Chrome theme, zoom and Mac lock state remain
unproved. No unrelated window is inspected and no theme/zoom or business state
changes. The new tab is then closed through its supported API; original
availability and separate cleanup records are archived. Section92's light/dark
browser-chrome requirement remains open.


### 2026-10-08 — Complete activation-validity source gate and retained flake

Exactbc38a5a passes all12 jobs in [CI37802454204](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37802454204):
446 backend cases/92.25s,619 frontend cases/44 files/34.40s and123 full-stack
cases/8.6min. Chromium96/4.1min, mobile92+4 skips/3.7min, Firefox92+4/4.7min
and WebKit91+one recovered flaky+4 skips/6.7min account for371 clean passes,
one flaky and12 intentional skips across384 planned smoke cases. Both images,
foundation/history secrets and Release pass. Test durations exclude setup.

The first WebKit reset-password filled-value scenario fails before filling or
submission: input readiness remains disabled for the five-second expectation.
Retry1 passes/2.3s. This is not presented as a clean92-pass WebKit result or
a confirmed filled-value/API-rejection defect. Source readiness depends on
credential initialization after mounting, not session/CSRF/submit responses.
The retained first trace records an original document,18 scripts and CSS200;
a second document request at+842ms fails with a WebKit internal error. At
+3764ms the console reports a network-process crash. No auth API request or
application runtime exception is recorded; controls remain disabled. The
second navigation initiator and hydration completion are unproved. This
implicates browser infrastructure without establishing an application defect.
No timeout, retry count or assertion is changed.

Raw checkout merge00c3a63d35cde6ff29110c4b1300c2ad93d5fa99 and local branch
share full tree55861e2bfe600bfff8da36cac88ced511b5ee4f4, checked against
GitHub's commit API. Raw log, job metadata, tree proof and the WebKit failure
report are archived outside the repository. Local FE05d/BEb6 remains a
separate runtime; new activation behavior has scoped PostgreSQL and pinned
CI evidence rather than a relabeled old backend container.


### 2026-10-08 — Exact current gate and positive profile pagination fixture

Exact `b04fcad` passes all12 jobs in
[CI37806507157](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37806507157):
446 backend/108.84s,619 frontend/44 files/25.67s,372 smoke passes with12
intentional skips and no reported flakes, and123 full-stack/6.4min. Smoke
Chromium96/4.0min, WebKit92+4 skips/6.3min, Firefox92+4/3.8min and mobile92+4/3.1min
account for384 planned cases. Both production images and Release pass.
Tested merge `6fa0f642403fb1cde3a528dbbf27e6803811cd9f` resolves through the
GitHub commit API to tree `53e9a4359bc76afa25f45add2e6fe2917aa4efb0`, equal to
branch `b04fcad`. Raw logs, metadata and tree proof are archived outside the repo.
The commit changes only three existing evidence documents; its application
source matches the previous activation gate. The earlier WebKit crash remains
unexplained and is not removed by this subsequent passing run.

One isolated packet creates a verified normal actor with25 private, text-only
published boards. Credentials remain in process pipes and browser memory;
a nonsecret ownership journal is fsynced before SQL commit. Root reads the
complete packet and independent security review precedes its single execution.
Actual FE05d/BEb6 runtime identities and selected source paths are checked;
this does not relabel the backend as the newer activation release.

At320x900 and1710x900, authenticated API pages contain24 and1 boards with
count25, correct next/previous links and a union matching exact owned IDs.
The browser visits the actual public username profile route, clicks Next,
holds the actual successful page2 response for one second, completes page2
and returns through Previous to page1. Tabs and panel top retain their document
positions; captured document widths equal viewport widths. Pagination is
absent while the panel loads, and panel height contracts to260px. Footer
movement is measured rather than presented as a quantified CLS result or a
requirement for fixed content height. The pager loading treatment awaits the
user's choice; no UI change follows from this diagnostic.

The browser/controller exit0 and no console/page or probe assertion errors
are recorded.39 `ERR_ABORTED` failures (18 narrow/21 wide) have no retained
request URL, so their causes cannot be attributed and clean-network success
is not claimed. Telemetry writes receive guarded204 responses, not delivery.
Rendered card counts/IDs and SSR HTML payloads are not separately asserted;
credential login, owner-settings and Drafts UI remain outside this packet.
Independent result review confirms these boundaries.

Exact owned account/board/draft/revision/cell/idempotency/session metadata,
durable/cached session, login event and actor throttle cleanup assertions pass;
the owned browser container is absent. This proves cleanup at execution time,
not guaranteed cleanup after a hard kill before journaling. Scripts, proof,
masked screenshots, cleanup and the nonsecret ownership journal are archived
outside the repository. No checklist item or section verdict is changed.


### 2026-10-08 — Hidden-bio projection packet stopped before negative controls

A separate two-actor fixture sets a unique owner bio marker and disables its
public visibility; an exact owned Follow edge exposes the existing application
profile link. Authentication uses explicit fixture sessions rather than
credential login. The owner session/API/SSR HTML checks return200 and match
owner identity; API and raw HTML contain the bio marker. HTML reports private,
no-cache/no-store response policy. The subsequent RSC observation fails before
a complete body result is recorded.16 request aborts include the target owner
profile RSC request; no console error is recorded. The saved generic Error does
not establish why the observation failed. Guest and unrelated negative controls
are not executed, so this packet does not prove hidden-bio privacy.

Browser/controller exit1 remains a failure. Exact owned accounts/profiles/privacy,
Follow edge, login events, durable/cached sessions and actor-scoped user and
session_status throttle keys pass cleanup assertions; the diagnostic container
is absent. Scripts and original artifacts are archived outside the repository.
An additional exact-key followup for the earlier pagination actor finds its
session_status throttle key already absent; no cache deletion is needed.
No source change, checklist tick or section closure follows from this packet.


### 2026-10-08 — Hidden-bio API/HTML controls and incomplete RSC collection

A distinct diagnostic retains the original failed packet and independently
checks owner, guest and unrelated sessions. All three auth envelopes match;
profile API and raw SSR HTML return200 with the correct target identity.
The hidden bio marker is present for the owner and absent for guest/unrelated
in both response surfaces. All three contexts click the existing Following
profile link and render the expected target identity and bio visibility.
This supplies bounded local API/HTML/DOM privacy evidence, not all profile
fields or production ingress/cache verification.

Six actual RSC responses (three prefetch and three navigation) report200,
authentication-bound proxy requests, complete upstream bodies and downstream
finish. Their raw proxy bytes match neither target identity nor bio marker.
Content-Encoding is not recorded or decoded by this packet; RSC payload
projection therefore remains unproved. Six browser body reads report
Network.getResponseBody: No data found for resource with given identifier.
35 request failures and zero console errors are retained. Both collection and
clean-flow verdicts are false; browser/controller exit1 is not converted to a
pass. Independent review confirms these limits and no application bug is
established. Exact fixture/session/throttle cleanup passes and the owned
browser container is absent. Original scripts/results are archived outside
the repository; no checklist item or section verdict changes.


### 2026-10-08 — Encoding-aware hidden-bio response projection

A separate encoding-aware diagnostic preserves both earlier failed packets.
It observes actual gzip Content-Encoding and decodes complete upstream RSC
bodies in memory using Node's built-in zlib. Forwarded wire bytes and headers
remain unchanged. Wire and decoded hashes/counts are recorded separately;
no complete response body or session credential is persisted.

Owner, guest and unrelated sessions pass all nine bounded controls: profile
API, raw SSR HTML and full decoded navigation RSC return the expected target
identity, with the hidden bio marker present only for the owner. All three
contexts use the existing Following NextLink and render the expected target
profile/bio visibility. The order is owner first, then guest and unrelated.
Six RSC responses report200, exact expected cookie binding, complete gzip
decoding, upstream completion and downstream finish. The three navigation
responses contain target username and public ID; the three partial prefetch
responses lack the ID and do not count as full witnesses. Independent result
review confirms the bounded projection controls.

Collection succeeds3/3, but clean-flow success remains false and browser/controller
exit1 is retained: six CDP response-body reads fail with No data found for
resource with given identifier,37 request failures remain, and no console
error or guarded business write is observed. Decoding HTTP compression does
not parse React Flight semantics or prove browser body retrieval/network
cleanliness. This is one local profile field across specified surfaces, not
all section76 privacy, production ingress/cache or credential-login coverage.
No application source correction or checklist verdict change is justified.

Exact owned accounts/profiles/privacy, Follow edge, session metadata/login events,
durable/cached sessions and actor-scoped user/session_status throttle keys pass
absence assertions; the diagnostic container is absent. Scripts/helper, hashes,
structured observations and cleanup are archived outside the repository.
