# Auth and editor control evidence — 2026-10-08

Bounded companion to the profile/account matrix for sections 4/5/7/8.
The dated evidence records actual source, commands, failures and test runs;
this table does not close all product forms or native-device requirements.

| Controls | Executed evidence | Remaining applicable evidence |
| --- | --- | --- |
| Token-only registration/email-change Retry | Original Mailpit token retained after held 503; focus outline and Space; Verifying status/disabled duplicate guard; real 200/204 success; URL token removed only after success; actual consumed-token 400 with recovery links; 320/1710 overflow and complete page-error assertions; four-engine packet | Quota-isolated fixture amendment passes eight token cases in four engines; real provider delivery and clipboard/password-manager capabilities remain separate |
| Verification resend and request ownership | 31 component cases including StrictMode single POST, stale token/mode/lifetime response suppression, callback handover, pending Retry/Resend competition and stale resend completion after new verification success; independent review | Broader held browser resend and all native form constraints remain in the form queue |
| Editor cell text and formatting | Native 100-code-unit clamp with multilingual/emoji/newline/literal markup content; Space on bold/italic/underline/strike; Home/End and arrows on opacity and border-width sliders with min/max clamps; native select typeahead/Tab; all stored fields read from real draft then reload; four engines | Actual OS clipboard paste, virtual keyboard and physical touch hardware are unverified |
| Editor title/description/tags | Native title 70/description 500/tag 40 clamp, associated visible help, normalized duplicate tags, 15-tag ceiling and Enter without accidental publication; real persistence/reload; long-tag wrapping defect reproduced and fixed at 320 px; 1710 px also checked | Native empty/pattern first-error traversal and all visual/control geometry states still require individual mapping |
| Cell image/required description | Same Unicode filename uploaded twice with distinct asset IDs, actual worker/thumbnail bytes, image-only publication selects invalid cell and focuses description with aria-invalid/associated alert; correcting alt clears invalid state; publication and public thumbnail/card layouts; four engines | Native OS chooser cancellation, invalid-size/type source-file behavior and active cancellation/failure controls remain separate |

Final frontend checks including the subsequent bounded metadata correction pass
470 tests, lint/typecheck and format; 382 PostgreSQL tests plus one
infrastructure-only skip pass. The four
engine scoped packet passes 16 cases, retries zero, with each project's normal
fixture reset and ingress pacing. A later test-only fixture ownership amendment
retains anonymous first registration confirmation and all real backend assertions;
its final eight token cases pass in four engines without retries. The a3e1c00 gate failed two existing browser expectations. Their corrected
input/interaction sequences pass four engines each with retries zero; the
next source still requires exact-SHA CI. The complete native-field label
inventory is in accessibility-verification-matrix.md.

## Current auth/guest packet — 2026-10-08

| Controls | Executed evidence | Remaining applicable evidence |
| --- | --- | --- |
| Login/register/forgot/reset request ownership | Held success after actual client departure preserves route/search/hash across16 strict engine cases; successful departed login updates global auth. Scoped35 auth tests cover obsolete errors/callbacks/query identities and initialized reset controls. Four real Mailpit reset/reuse journeys pass after the initialization correction. | Exact new-source CI remains pending; native autofill/password manager and BFCache stay separate. |
| Four auth forms' native controls | Sixteen cases across four engines at320/1710: required/invalid email/username min/max/pattern/password min, first invalid focus, Tab, Show/Hide with Space, Enter, one held POST, pending height/input geometry, retained error values and associated field feedback. | Mac WebKit link uses documented Option-Tab and app-only keyboard-navigation setting for buttons (restored afterward). Physical iOS and Linux CI path are not established by host emulation. |
| Guest nickname/share | Native required/max50, whitespace rejection, associated error/focus, FormData DOM capture, Enter and synchronous duplicate lock, disabled nickname/Cancel, retained Unicode/literal-markup nickname across503→real201→share reload. Four engine cases pass; player36 unit cases include old success/error during same-mounted board handover. | OS autofill/paste remain native capability checks; other product control inventories remain open. |
| Profile activity/export partial composition | Eight strict engine cases retain unsaved profile/email/password fields and unrelated usable controls while exact optional list/job GET fails; scoped real retries preserve identity and actual job IDs. | Actual provider/target performance and final full-stack gate remain separate. |

Node22 lint/types/full501 frontend cases pass before the two added player
regressions; their36-case scoped group passes afterward. No application source
changed in that coverage addition. Full ordered119-case passes119/119; exact-source CI
remains pending. Earlier native run6/10 fail and keyboard-setting run14/2 fail
are retained; the final16-case run passes, retries zero. These map the four auth
forms and guest share, not every native form in sections7/8.
