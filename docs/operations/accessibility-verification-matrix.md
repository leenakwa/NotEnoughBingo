# Accessibility evidence — 2026-10-08

This inventory maps sections 7/24/92. It records current product templates and
observed browser states; it does not establish native screen-reader behavior or
all physical devices.

## Native field labels

The independent static audit covered 71 non-test TSX sources in
`frontend/app`, `frontend/components` and `frontend/features`, including 255
role/ARIA sites in 33 files. All 45 native-field JSX template sites below have
associated labels. Mapped controls and the shared password field produce more
rendered controls than this template count. No field relies on its placeholder
as its accessible name.

| Source under `frontend` | Templates | Association |
| --- | ---: | --- |
| `components/auth/login-form.tsx` | 1 | Email wrapping label |
| `components/auth/password-field.tsx` | 1 | `useId()` input/label pair; reused by account forms |
| `components/auth/password-forms.tsx` | 1 | Recovery email wrapping label |
| `components/auth/register-form.tsx` | 2 | Email and username wrapping labels |
| `components/explore/explore-page.tsx` | 5 | Search/author/tags labels; sort radio labels inside named fieldset |
| `components/ui/language-picker.tsx` | 1 | Each mapped checkbox has a wrapping label; fieldset legend |
| `features/editor/bingo-details.tsx` | 7 | Title/language/description ID pairs; tag accessible name; wrapping visibility/completion/file labels |
| `features/editor/bingo-editor.tsx` | 1 | Background upload wrapping label, including pending wording |
| `features/editor/cell-inspector.tsx` | 10 | Text/image-description associations; wrapping color/file/border labels; named ranges with values |
| `features/editor/editor-board.tsx` | 1 | Coordinate-based inline textarea accessible name |
| `features/play/bingo-player.tsx` | 2 | Mark-style radios in named fieldset; nickname wrapping label |
| `features/profile/account-settings.tsx` | 3 | Avatar/email/notification labels; shared password field |
| `features/profile/profile-view.tsx` | 4 | Username/display-name/bio ID pairs; privacy wrapping labels |
| `features/social/comments-panel.tsx` | 4 | Root/reply/edit/recovery textarea ID associations |
| `features/social/report-dialog.tsx` | 2 | Reason/context ID pairs |

Dynamic references were traced through `useId()`, comment/bingo/kind IDs,
conditional inspector labels and coordinates. The audit does not independently
prove ID uniqueness in every possible combination of simultaneously mounted
components. Existing full-severity Axe and live social/dialog/editor/account
checks supplement this source inventory.

## Semantics and contrast

Two real semantic mismatches were corrected. The play/shared-result grid now
declares multiple selection while preserving marked cells, pressed states,
accessible names and immutable shared results. Active filter buttons now belong
to a named group. The primary rules are
[ARIA multiple selection](https://www.w3.org/TR/wai-aria-1.2/#aria-multiselectable)
and [generic role naming](https://www.w3.org/TR/wai-aria-1.2/#generic).
Eight board and four Explore component cases pass; independent review passes.

The actual Chromium probe at 320/1710 px covers populated Explore filters,
registration, two selected public play cells, loaded profile/account settings
and the editor inspector with Bold selected. Ten state/width combinations pass
full-severity Axe, complete console-warning/error and page-error assertions,
default large-heading/control text and visible control-border contrast of at
least 3:1, computable native accent contrast, and one keyboard-modality 3 px
focus-outline sample per state. Source-specific runs and failures are recorded
in the [dated evidence](production-readiness-evidence.md).

Default range accent computes to the ink color. The rendered Chromium native
checked checkbox was separately inspected: its dominant blue `(0,117,255)` and
white mark/background have 4.21:1 contrast; anti-aliased edge pixels are not the
solid accent.

This supports reasonable default large-text/UI contrast, with explicit limits:
author-controlled board colors/images, disabled controls, all OS-native widget
pixels, background-image/pseudo-element compositing, group opacity and every
focus state are not certified by this probe. Normal text contrast has separate
full-severity Axe evidence. The probe is not full WCAG certification.

## Native browser capability limits

Native Chrome200% zoom is now observed through browser-chrome accessibility
state and screenshots in one owned Guest window on local18584, using cached
frontend05d148a. This is bounded guest evidence, not a current full-application
image or an exact CSS viewport measurement. Discover header/catalog reflow and
keyboard opening of E2E Revision Board pass; game cell click/Space untoggle,
Right-arrow movement, full text and restored zero count are observed.

Login's lower buttons retain visible keyboard focus and internal vertical
scrolling; Tab from last control wraps to Close, Shift+Tab returns to the last
control, and Escape restores trigger focus. Support text wraps readably; delivery
through the configured support placeholder remains an operator check. Guest
Create shows a readable authentication gate. The registration dialog's lower
Log In link is reached after six Tabs with visible focus/internal scrolling;
Escape returns to Create account. No form values, submissions or authentication
are used. Chrome Reset confirms100% before only the owned Guest window closes.

An additional authenticated packet in native Chrome154/macOS at actual200%
observes readable profile username/display name/bio/language fields and visible
Tab outlines on Save profile, Send confirmation, Change password and Schedule
deletion. No settings write request is sent. The inline forgotten-current-password
link wraps around the button; its layout choice remains pending. An accessibility
union-center click hits Change password and shows required-field validation,
which does not establish a pointer defect. Keyboard focus+Return opens
`/forgot-password`; title/email/lower actions are readable and Back to login has
visible focus. Recovery submission/delivery remains unchecked.

Authenticated Create initially shows a readable pristine5×5 board and disabled
Save. Clicking a cell opens its inline textarea; batched Right+Return inserts a
newline and autosaves a new owned disposable draft. This does not prove board
arrow navigation. Escape/Undo restores25 empty cells and Saved. Inspector
headings/text/format and details title/language/cover actions are readable, with
visible language-control Tab focus. The exact owned draft is subsequently
soft-deleted through the existing service; histories remain.

This packet uses cached frontend05d148a/backendb6 on localhost18584. Frontend
application-source diff to5f4bca9 excluding tests is empty, establishing source
UI equivalence only, not a latest-image run. Own logout revokes the session but
unexpectedly opens an expiry auth dialog on `/login`; the traced same-document
logout-channel refresh race has a subsequent source fix passing623 frontend
units/45 files, typecheck/lint/format, scoped review and four-profile local browser
regression with synthetic APIs and native channel transport. The bounded native
current-frontend rerun below subsequently passes; exactc74 CI subsequently passes all12 jobs as recorded in the dated evidence. Completed exact5f CI does not cover that patch.
Chrome Reset confirms100% and only the owned Guest window closes. Native screenshots
remain in the tool conversation, without a separate saved-file artifact.

Other-form zoom, other engines/devices, native screen readers and
all-flow200% coverage remain unchecked; global section24 remains partial.
Only dark browser-chrome screenshot evidence exists, so section92's both-theme
favicon visibility remains unchecked. Viewport or CSS/device-scale changes do
not establish native zoom. See the evidence ledger's 2026-10-09 authenticated
native Chrome200% packet for cleanup and pending decisions.


## Current frontend native report focus — 2026-10-09

Native Chrome154/macOS at actual200% on exactc74 frontend/cachedb6 backend shows
readable report reason/context controls and internal vertical scrolling. Send report
has visible Tab focus; Tab from the last control wraps to Close, Shift+Tab returns
to the last control, and Escape restores Report profile trigger focus. No report
input/submission occurs. See the [dated evidence](production-readiness-evidence.md#2026-10-09--current-frontend-native-chrome200-report-and-own-logout)
for identity and cleanup. Other-form/engine/device/screen-reader coverage, exact
CSS viewport and both-theme favicon visibility remain open; global24/92 stay partial.
