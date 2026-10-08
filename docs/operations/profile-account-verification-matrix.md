# Profile and account control evidence — 2026-10-08

This is the bounded inventory for sections 4/5/7/8, not a claim that every form
in the product passes. Implementation references are
[ProfileView](../../frontend/features/profile/profile-view.tsx) and
[AccountSettings](../../frontend/features/profile/account-settings.tsx);
unit references are their adjacent `.test.tsx` files; browser references are
[live product flows](../../frontend/tests/e2e/live-product-flows.spec.ts).
The dated evidence log records which source and commands were actually tested.
For applicable visual states, reuse browser evidence only when inspected shared
styles and markup are equivalent. Verify unmatched custom styles, surrounding
focus/clipping contexts and asynchronous label/feedback transitions separately.
Individual rectangle measurements are not an additional checklist requirement.
The dated danger/Show-Hide packet adds28 bounded custom-state observations and
12 masked card screenshots at320/1710px. Collection succeeds;30 request failures
and three console errors, including a500 strongly attributed to optional unread
count proxy `ECONNRESET` (exact correlation/cause unproved), retain failed clean-flow
and wrapper verdicts. It does not establish network health or close section8.
The subsequent language/range packet adds26 bounded custom-state observations:
actual language-wrapper focus, checked/unchecked hover/press and disabled pending,
plus one editor slider's focus/pointer minimum. Six masked images are inspected;
34 request failures/two controlled422 console errors retain failed clean-flow.
Real persistence, native-device capabilities and global section8 remain separate.

| Controls and form ownership | Executed or static evidence | Remaining applicable evidence |
| --- | --- | --- |
| Profile username/name/bio/Save, one form | Labels, username 3–30/name 80/bio 500 limits, actual FormData capture, trimming, retained failures, dirty recovery/navigation, Enter and 320/1710 overflow in existing live journeys; 19 profile units plus 32 route-controlled native browser cases prove required/minimum/pattern/keyboard maximum constraints, optional blank name/bio, Tab/textarea Enter, held pending one-write lock, per-field/multiple-error focus and field-only clearing | Map applicable visual states to shared-style browser evidence and verify unmatched custom/focus/clipping/async contexts; real autofill/managers and Mac/other-browser clipboard remain separate; configured065 Linux clipboard is recorded below. Controlled field rejection/payload assertions do not prove server persistence |
| Language fieldset/standalone Save button | Space selection, unit Tab→Enter, selected/all choices, pending locks/one write, scoped failure, canceled dirty navigation, real retry and loaded reload; existing native preference cases prove Tab/ShiftTab focus, accepted Discover→Back restoration and actual beforeunload dismissal/acceptance with reload baseline at320/1710; all four 38fd browser jobs pass | Unmatched visual/async contexts and native-device evidence |
| Privacy and notification standalone automatic writes | Labels, optimistic state, scoped pending status, rollback, preserved profile draft, Space, one write, real retry/reload | Map hover/press/focus to equivalent shared-style evidence and verify unmatched contexts; active permission/session-denial cases |
| Separate email/password forms; Show/Hide buttons | Existing units/live journeys prove real FormData, mismatch/field focus after enabling, pending guards, retention/clearing and Enter; new controlled native cases prove required/typeMismatch, keyboard-entered11→12 new/confirmation boundaries, full card Tab/Show-Hide ownership, DOM email edge-space stripping with mixed case preserved to API, untrimmed passwords and short current credentials; existing backend email-change test proves lowercase normalization | Native autofill/password-manager, Mac/other-browser clipboard and unmatched control-state contexts; configured065 Linux clipboard is recorded below. Reload observation clears volatile email/password without warning; no persisted-work or desired policy claim |
| Deletion password/confirmation form; standalone cancellation | Existing real API scheduling/grace-period and browser cancellation evidence; new native cases prove empty input opens no confirmation, short untrimmed current credential, Tab/Show-Hide no submit, Enter/dismiss retains input/no write, accept invokes own endpoint once and retained422/error focus after pending | Exacta55a2b1 CI passes successful scheduling through the browser confirmation, original-cookie revocation, grace login and UI cancellation; dedicated-fixture a164 CI passes the combined suite. Unmatched visual feedback contexts remain separate; scheduling/recovery does not prove physical deletion |
| Avatar input/upload/removal/cancel | Labeled file input, 5 MB/type hint, input reset and phase feedback, cancellation/lifetime units; actual upload/remove persistence and chooser keyboard/focus journey; exact a164 CI proves invalid/oversized zero-write behavior and same-file intent503 retry; exact38fd CI passes attachment/removal503 recovery and persistence | Native OS chooser cancellation; progress remains phase based |
| Session Sign out/account Log out/section Retry | Independent loading/error/retry, private identity gating, logout/login and obsolete-callback units/journeys; other-session Space/Enter, scoped pending, held failure and real retry/revocation, unrelated draft preserved | Synthetic empty-session UI passes8/8 at320/1710 in all four browser profiles. Exact5f CI passes held logout503/scoped error/unchanged auth→actual204/login and owned current-session DELETE204→secondary guest401 with primary draft untouched. Native cached-image logout separately opens an unexpected expiry dialog; a later shared-channel fix passes623 full frontend units/45 files, typecheck/lint/format, scoped review and four-profile local browser regression with synthetic APIs/native channel transport. Exact-source CI and native current-image verification remain pending; exact5f CI does not cover it. Current-session pending has unit evidence; disabled native click suppression does not prove callback reentrancy |
| Export request/status/download link | Semantic button→link, preparing feedback, polling/lifetime guards; real ZIP download journey; exact71a22ec full-stack CI covers accepted real job→controlled status-read503→real same-job retry/ready with retained drafts and320/1710 overflow checks (`live-product-flows.spec.ts`, “account export creation and accepted status failures preserve unsaved fields and allow real recovery”) | Exact0d CI passes creation503→real recovery and all route-controlled failed/expired/41-poll exhaustion cases across four browser profiles, including retry, retained drafts and keyboard anchor activation. Failed761 helper history remains in the dated evidence. Native file delivery/error remains unproved; controlled geometry does not settle feedback-layout policy |
| Public-profile Follow/Report launcher | Identity gating, optional viewer retry, obsolete follow completion, native buttons; configured065 controlled POST503→204 and DELETE503 retain the correct state, with Tab/Shift+Tab focus and pending/hover/press observations below | Exact0d CI passes Unfollow503→native keyboard retry→real204/API/reload at320/1710 in the existing live journey; pointer-launched report focus remains unverified. Relationship/count restoration recreates follower notifications and FOLLOW events, so it does not undo every fixture side effect; downstream flows remain in the combined gate. Intercepted Follow success does not prove persistence |
| Profile activity tabs | Browser-proved selected hover/held-press contrast regression corrected by scoped text color; 8 cases at320/1710 in four profiles prove computed contrast17.53 hover/press and19.80 normal/focus, 3px keyboard outline, preserved press movement and no overflow/page errors | Included in source5e71cd8 and its optimized-image native packet. Disabled N/A; loading belongs to panel. Other control state inventories remain separate |

Four new language/privacy/notification cases passed in Chromium, mobile WebKit,
Firefox and desktop WebKit: **16/16, retries zero**. Earlier strict profile/account
cases are recorded separately. Deliberately mocked 503 errors test UI recovery;
they do not establish provider availability.

The final combined packet adds sign-out/cancellation and passes **24/24** in the
same four engines, retries zero, including real successful writes and full
page-error assertions. Source/count/log references are in the dated evidence.

Native autofill/password-manager operation and Mac/device clipboard remain
unverified. The [Linux clipboard packet](artifacts/native-form-keyboard-2026-10-08.json)
subsequently verifies every editable text field of the profile/email/password/
deletion forms with actual trusted paste and ordinary text copy; no real writes. `autocomplete`, no paste interception and silent DOM-fill submission
establish plumbing/static behavior only. These account controls have no numeric
inputs, reset buttons or skeletons; numeric-range checks are N/A here. Saved
baselines, cleared credentials, rollback, upload cancellation and identity cleanup
cover relevant reset semantics.

Narrow/wide overflow checks do not prove a physical virtual keyboard, every
control's visual states or feedback layout stability. Keep those limits explicit
when mapping this inventory to the original checklist.

## Public Follow control — 2026-10-08

The [profile control artifact](artifacts/profile-tab-states-2026-10-08.json) adds
two Chromium320/1710 failure/retry flows and two native focus probes on the exact
configured065 image. Follow/Following hover and held press change visibly;
Tab/Shift+Tab expose3px focus outlines. Pending shows “Saving…” and “Saving
changes…”, disables the button and retains44px height. Controlled503 retains
Follow, own POST204 retry shows Following, and DELETE503 retains Following.
Only the follower endpoint is invoked by these actions; analytics/client-errors
are separately intercepted. Mobile width stays288px; desktop label widths vary
89.61→99.22→118.42px. No real writes or global layout/control verdict is claimed.

## Notification, session and export geometry — 2026-10-08

A later disposable-account packet records19 DOM geometry states at each of
320x1000 and1710x1000: notification checkbox and noncurrent-session Sign out
normal/hover/held press/pending/completion, plus export creation/status/polling
and ready-link states. Controlled cookie-bound responses prevent real writes,
revocation or export delivery. Measured controls/labels/statuses have no ancestor
clipping or document/body horizontal overflow. Button/link press uses a1px
transform without raw layout reflow. Session loading widens its button; feedback
increases card height and is cleared when another action starts. Status-space
and session-width choices await the user.

Collection succeeds38/38; clean-flow and wrapper remain failed with20 request
failures, two untrusted-origin COOP console messages and two controlled503 console
messages. Exact owned cleanup passes. This supplements the table's per-control
geometry gaps only for these three controls/states; screenshots, colors, focus,
privacy controls, real persistence/revocation/delivery and other remaining
evidence retain their separate scope. See the dated evidence log for details.

## Save profile partial geometry — 2026-10-08

Ten captures across320/1710 cover normal, hover, actual Tab focus, held press and
disabled Saving profile. Tab reaches the submit button with a3px solid outline/
3px offset; held press preserves raw layout through a1px transform. Pending
text widens the44px-high button and feedback adds39px form height, without
measured clipping/overflow. Four masked form-only images were visually inspected.
Completion remains unverified: an incorrectly shaped synthetic422 causes both
field-alert waits to time out. Collection and wrapper fail, with15 request
failures/two controlled422 console errors retained; owned cleanup passes. This
is partial geometry evidence, not a profile-save, global aesthetic or rendered
disabled-contrast pass. See the dated evidence log; the original packet remains
unchanged. A separate correctly shaped completion-only packet subsequently
collects pending-baseline/error-completion geometry and one masked image at each
width: retained input, enabled Save and automatic Username focus; nearby error
wraps without measured form/control/error clipping or horizontal overflow.
Its collection succeeds, while14 request failures/two controlled422 console
errors retain failed clean-flow/wrapper verdicts. Exact owned cleanup passes.
Backend persistence, other profile controls and layout policy remain separate.


## Authenticated native200% and completed exact5f gate — 2026-10-09

Native Chrome154/macOS at actual browser-menu200% on localhost18584 shows
readable profile fields and visible Tab outlines on Save profile, Send
confirmation, Change password and Schedule deletion. No settings write request
is sent. The inline forgotten-current-password link wraps around its neighboring
button, with layout choice pending; keyboard focus+Return opens readable
`/forgot-password` with visible Back-to-login focus. An accessibility union-center
click that instead hits Change password and required-field validation is not
proof of an actual pointer defect. Recovery delivery, native autofill/managers
and other engines/devices remain separate. Cached frontend05d148a/backendb6
establishes source UI equivalence to5f excluding tests, not a latest-image run.

Own logout revokes only its session and preserves all ten baseline active-session
IDs/profile values, but opens an unexpected expiry dialog. Distinct publisher
and header channel objects allow the logout string to reach the same-document
header; runtime ordering is inferred. A subsequent working-tree fix shares one
channel per document while retaining the legacy string. The full frontend suite
passes623 tests/45 files in10.85s; typecheck/lint/format and scoped correctness/
security/privacy review pass. Four configured browser profiles pass a synthetic-
API regression with real mounted account/auth UI, native channel transport and
blocked storage: own logout shows no expiry dialog/event, while a foreign legacy
logout witness still does. Exact-source CI and native current-image verification
remain pending; this later patch is outside completed exact5f CI. See the dated
evidence ledger for both retained prepatch failures and the completed private
31-file provenance/artifact archive.

[CI37844368314](https://github.com/leenakwa/NotEnoughBingo/actions/runs/37844368314)
passes all12 jobs, including444 smoke cases/12 intentional skips and125 live
cases without reported flakes/retries. The password-reset held503→real204/login
case passes6.6s; actual owned current-session revocation passes4.7s. Branch5f
and tested merge share tree `996c08acbf0f53024927392a60ee1a45eecb55e8`; original
logs/artifacts/API/checksums are archived privately under
`evidence-5f4bca9-2026-10-09/ci/`. Counts stay816/326, including85 N/A and241
applicable; no global readiness verdict follows.
