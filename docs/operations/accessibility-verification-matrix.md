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

Actual200% browser zoom, light/dark browser-chrome favicon visibility, native
screen-reader behavior and physical devices remain unchecked. Viewport or
CSS/device-scale changes do not establish native zoom. Working native browser
controls and browser-chrome screenshots are required for those observations.
