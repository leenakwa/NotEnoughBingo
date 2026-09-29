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

### Remaining local evidence to gather

- Broader invalid input/media-upload cases, keyboard and responsive flows for
  newly added controls, and real service-outage behavior remain in the work
  queue. None of the external launch gates has been closed by these local tests.
