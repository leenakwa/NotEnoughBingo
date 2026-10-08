# Auth and editor control evidence — 2026-10-08

Bounded companion to the profile/account matrix for sections 4/5/7/8.
The dated evidence records actual source, commands, failures and test runs;
this table does not close all product forms or native-device requirements.

| Controls | Executed evidence | Remaining applicable evidence |
| --- | --- | --- |
| Token-only registration/email-change Retry | Original Mailpit token retained after held 503; focus outline and Space; Verifying status/disabled duplicate guard; real 200/204 success; URL token removed only after success; actual consumed-token 400 with recovery links; 320/1710 overflow and complete page-error assertions; four-engine packet | Quota-isolated fixture amendment passes eight token cases in four engines; real provider delivery, Mac/other-browser clipboard and general password-manager capabilities remain separate; configured065 Linux clipboard is recorded below |
| Verification resend and request ownership | 31 component cases including StrictMode single POST, stale token/mode/lifetime response suppression, callback handover, pending Retry/Resend competition and stale resend completion after new verification success; independent review | Broader held browser resend and all native form constraints remain in the form queue |
| Editor cell text and formatting | Native 100-code-unit clamp with multilingual/emoji/newline/literal markup content; Space on bold/italic/underline/strike; Home/End and arrows on opacity and border-width sliders with min/max clamps; native select typeahead/Tab; all stored fields read from real draft then reload; four engines | Configured065 Linux native clipboard is recorded below; Mac/other-browser clipboard, virtual keyboard and physical touch hardware are unverified |
| Editor title/description/tags | Native title 70/description 500/tag 40 clamp, associated visible help, normalized duplicate tags, 15-tag ceiling and Enter without accidental publication; real persistence/reload; long-tag wrapping defect reproduced and fixed at 320 px; 1710 px also checked | Native empty/pattern first-error traversal and all visual/control geometry states still require individual mapping |
| Cell image/required description | Same Unicode filename uploaded twice with distinct asset IDs, actual worker/thumbnail bytes, image-only publication selects invalid cell and focuses description with aria-invalid/associated alert; correcting alt clears invalid state; publication and public thumbnail/card layouts; four engines | Native OS chooser cancellation, invalid-size/type source-file behavior and active cancellation/failure controls remain separate |

Source-specific run identities, failures and corrected browser expectations are
recorded in the [dated evidence](production-readiness-evidence.md). The complete
native-field label inventory is in
[accessibility verification](accessibility-verification-matrix.md).

## Current auth/guest packet — 2026-10-08

| Controls | Executed evidence | Remaining applicable evidence |
| --- | --- | --- |
| Login/register/forgot/reset request ownership | Held success after actual client departure preserves route/search/hash across16 strict engine cases; successful departed login updates global auth. Scoped35 auth tests cover obsolete errors/callbacks/query identities and initialized reset controls. Four real Mailpit reset/reuse journeys pass after the initialization correction;606 all-nine CI and16 optimized silent-fill cases pass. | Native autofill/password manager and BFCache remain unverified. |
| Four auth forms' native controls | Sixteen cases across four engines at320/1710: required/invalid email/username min/max/pattern/password min, first invalid focus, Tab, Show/Hide with Space, Enter, one held POST, pending height/input geometry, retained error values and associated field feedback. Linux path passes in606 smoke264/12 intentional skips without retries. | Mac WebKit link uses documented Option-Tab and app-only keyboard-navigation setting for buttons (restored afterward). Physical iOS remains unverified. |
| Guest nickname/share | Native required/max50, whitespace rejection, associated error/focus, FormData DOM capture, Enter and synchronous duplicate lock, disabled nickname/Cancel, retained Unicode/literal-markup nickname across503→real201→share reload. Four engine cases pass; player36 unit cases include old success/error during same-mounted board handover. | OS autofill and Mac/other-browser paste remain native capability checks; configured065 Linux clipboard is recorded below; other product control inventories remain open. |
| Profile activity/export partial composition | Eight strict engine cases retain unsaved profile/email/password fields and unrelated usable controls while exact optional list/job GET fails; scoped real retries preserve identity and actual job IDs. | Actual provider/target performance and final full-stack gate remain separate. |

Source5e71cd8 passes581 frontend units and the configured optimized-image packet
of156 controlled native cases, including16 editor and32 preference cases. A
separate nine-case real API/SSR packet also passes. Historical run corrections
and the subsequent complete source065 CI gate are recorded in the
[dated evidence](production-readiness-evidence.md) and
[release assessment](release-assessment-2026-09-29.md). These results map the
listed controls, not every native form in sections7/8.

## Native social and search keyboard — 2026-10-08

[Configured source065 keyboard proof](artifacts/native-form-keyboard-2026-10-08.json)
adds six Chromium/Firefox/WebKit cases at320/1710:30 root/reply/edit/report/guest
share form walks. Tab/Shift+Tab, textarea newline Enter and submit Enter pass;
each form invokes only its own held endpoint, then retains text after controlled400.
Three separate Explore cases pass Search/Author/Tags/sort/Search/Clear forward and
reverse traversal, radio ArrowDown and own-form Enter. Existing eight auth/profile/
account form kinds plus these six complete the14-form keyboard/submit inventory;
editor controls retain their separately recorded native packet scope.

Two initial WebKit cases failed a launcher-focus expectation after pointer opening.
Only their diagnostic launch changed to keyboard Enter, then both passed; the
original four Chromium/Firefox cases were retained. Corrected WebKit keyboard
opening returns focus to its launcher after Escape. A separate WebKit pointer-launch observation
leaves BODY focused, so no universal pointer-focus return is claimed. API writes
are intercepted, not persisted; native autofill/password-manager, Mac/other-browser
clipboard, dirty-form policy and all-control visual states remain separate. The
configured065 Linux clipboard result is recorded below.

## Editor custom control observations — 2026-10-08

The [editor control artifact](artifacts/editor-tag-controls-2026-10-08.json) adds
two Chromium320/1710 cases on configured065. Size3→10→3 and disabled bounds,
Bold selected state, tag removal, download disclosure and native3px focus work
without overflow. Size/format/tag hover and held press keep their appearance;
the user is choosing their feedback treatment. Download hover/press changes.
Pointer activation after resize works; mobile inline editing hides the inspector
until Escape. Initial harness expectations missed that state and incorrectly
forbade five legitimate intercepted autosave PUTs per case. Corrected original
pointer cases pass, with no manual-save/publish/export or real backend writes.
No page/console errors. This does not close all-control visual requirements.

## Native social unload warning — 2026-10-08

The [native form artifact](artifacts/native-form-keyboard-2026-10-08.json) adds
eight complete Chromium/WebKit cases at390px for root/reply/edit/report:
actual beforeunload cancellation retains exact text; accepted full reload clears
root/reply/report and restores the edit's server original. Page memory does not
persist those drafts through accepted reload. No business or real backend writes.
Firefox shows actual warnings and retains text on cancellation for all four
forms through DOM Location.reload; final document markers did not confirm
accepted reload within5s. Initial prototype PASS results read the old document
and are excluded. The automation/Firefox difference remains unresolved.
This establishes bounded warnings, without a global dirty-form policy verdict.


## Isolated Linux clipboard — 2026-10-08

The [native form artifact](artifacts/native-form-keyboard-2026-10-08.json) maps all
24 editable text fields of14 forms, six editor surfaces and the two-cell shared
text field on configured source065. Actual Control+V produces trusted paste and
insertFromPaste with exact Unicode/multiline values:31/31 pass. Ordinary text
Control+C roundtrips pass23/23; eight password fields are paste-tested without
attempting native password copying. Editor metadata, inspector text/image alt,
inline and shared text are included. No business/real backend writes or page
errors; controlled progress404 errors remain. Linux Chromium149 at390px only: native
Mac/devices, Firefox/WebKit clipboard and autofill/password managers remain
separate. Initial harness failures and corrections are retained externally.


## Built-in password-manager observation — 2026-10-08

The [native form artifact](artifacts/native-form-keyboard-2026-10-08.json) records
isolated full Linux Chromium149: real password-manager WebUI Add/Save stores a
dummy credential; native suggestion fills initialized Login. DOM, FormData and
controlled submitted payload match without application DOM-fill/JS autofill.
Suggestion Enter causes one controlled400, then the explicit button another;
analytics is intercepted and no real auth writes occur. Initial headless-shell
and WebUI-locator setup failures are retained. The owned profile is deleted.
Three later account-form attempts leave current-password empty while retaining
other entered values; this does not establish an application defect. General
manager/autofill coverage remains open, including those forms, generation,
automatic saving after success, third-party managers and Mac/devices.

The later current-email username-anchor prototype still leaves Change email's
password empty; stored vault identity was not read back. Addresses WebUI Save
does not prove a stored profile; four empty autofill targets are inconclusive.
Both experiments retain other fields and have no real writes. The artifact
records these limits; no account form fix or general autofill verdict follows.


Registration credential metadata now uses Email as username and the public
handle as nickname, matching email-based Login. Existing37 submission tests and
full lint/types/589 tests pass. Current dev rendered attributes match; its fields
stay disabled in the recorded readiness observation, so no current browser
submission or general manager-save success is claimed. At this observation the
exact source gate was pending; its completed result is recorded below.
Configured065 native packets retain their previous source scope.


The complete224 CI passes388 backend,589 frontend,372 smoke/12 intentional skips
and123 live cases. It closes the metadata source gate, without making historical
configured065 proofs new runtime evidence. A reachable standalone registration
fallback puts email in the verification URL; the user is choosing a replacement.
No email-query/manager/dirty-form requirement is closed from that source audit.

After the verified development configuration restart, the same15s registration
readiness check again returns HTTP200 with three disabled fields and correct
autocomplete attributes; errors and writes remain zero. No submission assertion
is reached. Cause remains unestablished; this does not establish a logging link.


## Exact optimized source a2 — 2026-10-08

The existing [native artifact](artifacts/native-form-keyboard-2026-10-08.json)
records an initialized standalone registration at390px within the same15s gate:
native input of three dummy fields, one controlled400, exact payload/retention
for all three and re-enabled submission; no overflow. Guest390 and registered
390/1710 players retain their grid, including while Report is open. Report uses
one46% backdrop, fits both widths and closes on Escape; screenshots were inspected.
No page errors or real mutations; the expected400 console is retained. These
local immutable a2 images have matching source/build/runtime release identities;
backend uses development settings with fixture PostgreSQL. This is bounded
optimized evidence, not a cause for the earlier dev timeout or a general native
manager/device verdict. Complete exact a2 CI passes all nine jobs:402 backend,
589 frontend,372 smoke/12 intentional skips and123 live cases.
