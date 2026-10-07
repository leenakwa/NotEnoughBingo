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
| Profile username/name/bio/Save, one form | Labels, username 3–30/name 80/bio 500 limits, actual FormData capture, trimming, retained failures, username-error focus, dirty recovery/navigation, Enter, 320/1710 overflow; profile units and `profile saves silent filled values…` journey | Native empty/pattern/boundary inputs for these fields; name/bio-specific rejection focus and first-error ordering |
| Language fieldset/standalone Save button | Space selection, unit Tab→Enter, selected/all choices, pending locks/one write, scoped failure, canceled dirty navigation, real retry and loaded reload | Browser Tab/focus-ring traversal and accepted navigation/unload of language drafts |
| Privacy and notification standalone automatic writes | Labels, optimistic state, scoped pending status, rollback, preserved profile draft, Space, one write, real retry/reload | Per-control hover/press/focus geometry; active permission/session-denial cases |
| Separate email/password forms; Show/Hide buttons | Native required attributes; new-password 12-character hint; actual FormData capture, mismatch/field focus after enabling, pending guards, rejection retention, successful clearing; Enter in strict account journeys | Native empty/invalid-email/minimum constraints; email case/space normalization and password edge whitespace; full card keyboard traversal; intentional credential dirty-navigation policy |
| Deletion password/confirmation form; standalone cancellation | Native password/confirmation, pending guards, wrong-password error association/focus, retained input and dismissed confirmation in strict journey; isolated registration/verification, API scheduling, grace-period login, browser cancellation pending/failure/keyboard retry/reload | Successful scheduling through the browser confirmation dialog; per-control visual feedback stability |
| Avatar input/upload/removal/cancel | Labeled file input, 5 MB/type hint, input reset and phase feedback, cancellation/lifetime units; actual upload/remove persistence and chooser keyboard/focus journey | Active upload/attach/remove failures, same-file retry, invalid/oversized avatar input, native OS chooser cancellation; progress remains phase based |
| Session Sign out/account Log out/section Retry | Independent loading/error/retry, private identity gating, logout/login and obsolete-callback units/journeys; other-session Space/Enter, scoped pending, held failure and real retry/revocation, unrelated draft preserved | Active current-session revocation in browser, empty session list, account logout failure/retry; current-session pending has unit evidence |
| Export request/status/download link | Semantic button→link, preparing feedback, polling/lifetime guards; real ZIP download journey | Create/poll failure, failed/expired job, polling limit/retry, download keyboard/error, feedback layout stability |
| Public-profile Follow/Report launcher | Identity gating, optional viewer retry, obsolete follow completion, native buttons | Profile handler active follow/unfollow success/error/retry, keyboard activation and report-launcher focus; player follow evidence does not prove this handler |

Four new language/privacy/notification cases passed in Chromium, mobile WebKit,
Firefox and desktop WebKit: **16/16, retries zero**. Earlier strict profile/account
cases are recorded separately. Deliberately mocked 503 errors test UI recovery;
they do not establish provider availability.

The final combined packet adds sign-out/cancellation and passes **24/24** in the
same four engines, retries zero, including real successful writes and full
page-error assertions. Source/count/log references are in the dated evidence.

Native autofill/password-manager operation and actual clipboard paste remain
unverified. `autocomplete`, no paste interception and silent DOM-fill submission
establish plumbing/static behavior only. These account controls have no numeric
inputs, reset buttons or skeletons; numeric-range checks are N/A here. Saved
baselines, cleared credentials, rollback, upload cancellation and identity cleanup
cover relevant reset semantics.

Narrow/wide overflow checks do not prove a physical virtual keyboard, every
control's visual states or feedback layout stability. Keep those limits explicit
when mapping this inventory to the original checklist.
