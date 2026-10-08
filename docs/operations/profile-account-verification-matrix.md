# Profile and account control evidence — 2026-10-08

This is the bounded inventory for sections 4/5/7/8, not a claim that every form
in the product passes. Implementation references are
[ProfileView](../../frontend/features/profile/profile-view.tsx) and
[AccountSettings](../../frontend/features/profile/account-settings.tsx);
unit references are their adjacent `.test.tsx` files; browser references are
[live product flows](../../frontend/tests/e2e/live-product-flows.spec.ts).
The dated evidence log records which source and commands were actually tested.

| Controls and form ownership | Executed or static evidence | Remaining applicable evidence |
| --- | --- | --- |
| Profile username/name/bio/Save, one form | Labels, username 3–30/name 80/bio 500 limits, actual FormData capture, trimming, retained failures, dirty recovery/navigation, Enter and 320/1710 overflow in existing live journeys; 19 profile units plus 32 route-controlled native browser cases prove required/minimum/pattern/keyboard maximum constraints, optional blank name/bio, Tab/textarea Enter, held pending one-write lock, per-field/multiple-error focus and field-only clearing | Per-control visual-state geometry; real autofill/managers and Mac/other-browser clipboard remain separate; configured065 Linux clipboard is recorded below. Controlled field rejection/payload assertions do not prove server persistence |
| Language fieldset/standalone Save button | Space selection, unit Tab→Enter, selected/all choices, pending locks/one write, scoped failure, canceled dirty navigation, real retry and loaded reload | Browser Tab/focus-ring traversal and accepted navigation/unload of language drafts |
| Privacy and notification standalone automatic writes | Labels, optimistic state, scoped pending status, rollback, preserved profile draft, Space, one write, real retry/reload | Per-control hover/press/focus geometry; active permission/session-denial cases |
| Separate email/password forms; Show/Hide buttons | Existing units/live journeys prove real FormData, mismatch/field focus after enabling, pending guards, retention/clearing and Enter; new controlled native cases prove required/typeMismatch, keyboard-entered11→12 new/confirmation boundaries, full card Tab/Show-Hide ownership, DOM email edge-space stripping with mixed case preserved to API, untrimmed passwords and short current credentials; existing backend email-change test proves lowercase normalization | Native autofill/password-manager, Mac/other-browser clipboard and per-control state geometry; configured065 Linux clipboard is recorded below. Reload observation clears volatile email/password without warning; no persisted-work or desired policy claim |
| Deletion password/confirmation form; standalone cancellation | Existing real API scheduling/grace-period and browser cancellation evidence; new native cases prove empty input opens no confirmation, short untrimmed current credential, Tab/Show-Hide no submit, Enter/dismiss retains input/no write, accept invokes own endpoint once and retained422/error focus after pending | Successful scheduling through the browser confirmation dialog; per-control visual feedback stability. Controlled accept422 establishes flow, not actual deletion |
| Avatar input/upload/removal/cancel | Labeled file input, 5 MB/type hint, input reset and phase feedback, cancellation/lifetime units; actual upload/remove persistence and chooser keyboard/focus journey | Active upload/attach/remove failures, same-file retry, invalid/oversized avatar input, native OS chooser cancellation; progress remains phase based |
| Session Sign out/account Log out/section Retry | Independent loading/error/retry, private identity gating, logout/login and obsolete-callback units/journeys; other-session Space/Enter, scoped pending, held failure and real retry/revocation, unrelated draft preserved | Active current-session revocation in browser, empty session list, account logout failure/retry; current-session pending has unit evidence |
| Export request/status/download link | Semantic button→link, preparing feedback, polling/lifetime guards; real ZIP download journey | Create/poll failure, failed/expired job, polling limit/retry, download keyboard/error, feedback layout stability |
| Public-profile Follow/Report launcher | Identity gating, optional viewer retry, obsolete follow completion, native buttons; configured065 controlled POST503→204 and DELETE503 retain the correct state, with Tab/Shift+Tab focus and pending/hover/press observations below | Unfollow success/retry and pointer-launched report focus remain unverified; intercepted Follow success does not prove persistence |
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
