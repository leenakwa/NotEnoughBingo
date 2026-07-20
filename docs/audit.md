# Phase 0 repository audit

Audit date: 2026-07-20

## Executive summary

The starting repository is a static browser prototype, not a deployable
application. Its useful asset is the bingo editor interaction model: a square
board, a side inspector, rectangular multi-cell selection, detailed cell
formatting, and a second metadata step. There is no backend, real persistence,
authentication, authorization, API, infrastructure, test suite, or production
configuration to preserve.

The migration should retain the monochrome visual language and editor
semantics while replacing mock cards, dead routes, base64/localStorage
persistence, and duplicated page shells.

## Repository baseline

At the start of Phase 0:

- branch `master` matched `origin/master`;
- the working tree was clean;
- Git history contained two commits and no tags;
- 17 files were tracked:
  - four HTML pages;
  - three CSS files;
  - two JavaScript files;
  - one AVIF placeholder image;
  - seven JetBrains project files.

There was no root `README`, root `.gitignore`, license, dependency manifest,
lockfile, build system, CI workflow, Docker configuration, application
configuration, or automated test.

## Existing pages

| File | Current behavior | Target route |
| --- | --- | --- |
| `main.html` | Renders 12 hardcoded mock cards | `/trending` |
| `foryoupage.html` | Header only; no feed | `/discover` |
| `allbingopage.html` | Filter markup, but missing CSS and JS | `/explore` |
| `createbingo.html` | Partially functional browser-only editor | `/create` and authenticated edit routes |

Missing targets referenced by the prototype:

- `profile.html`;
- `playbingo.html`;
- `allbingo.css`;
- `allbingo.js`.

The dynamic card link `playbingo.html?id=<sequential-id>` is incompatible with
the required stable `/bingo/{bingoId}` route. All profile links currently end
in a 404. Brand links on two pages are inert `#` links.

## Working editor behavior

The editor currently supports:

- board sizes from 3×3 to 10×10;
- rectangular pointer-drag selection;
- applying changes to multiple cells;
- plain text;
- text color;
- bold, italic, underline, and strikethrough;
- cell background color and opacity;
- a cell image and image opacity;
- border color, width, and style;
- a board background preview;
- a cover preview;
- up to 15 locally normalized tags;
- board-to-metadata step navigation.

These behaviors form the compatibility baseline for the Next.js editor.

## Mock and incomplete behavior

- The catalog consists of 12 hardcoded fandom entries using one cover.
- Discover has no content.
- Explore has no functioning search, filtering, sorting, results, or empty
  state because its local assets do not exist.
- Like and comment buttons are decorative.
- Create/Publish only displays a success-like message.
- PNG and PDF download only displays a message.
- Tags come from a hardcoded JavaScript array.
- Draft save writes one object to `localStorage`; there is no draft load path.
- Board background and cover are not included in that draft object.
- Images are stored as base64 Data URLs and can exceed browser storage quotas.
- There is no description, visibility control, mark style, login state,
  loading state, API error state, or conflict handling.

## Editor migration risks

### Board resizing

Cells are addressed by a linear array index. Changing from 5 columns to 6
changes the visual row/column meaning of existing indices; shrinking truncates
the array. The target document must address a cell by explicit row/column or
apply a documented top-left preservation transform.

### Image layering

The opaque color overlay is rendered above the cell image and board
background. At 100% background opacity the image is invisible. The target
renderer must define and test the intended layer order.

### Selection state

The prototype treats document data and UI selection as global mutable state.
The migration must separate persistent document state from transient selection,
drag, inspector, and dirty-state concerns.

### Browser APIs

`window`, `FileReader`, pointer capture, and `localStorage` are used directly.
They must be isolated in client components. Media previews should use temporary
object URLs, then replace them with server-issued asset IDs.

## Accessibility and responsive gaps

- Two pages omit viewport metadata.
- Header semantics differ between pages and no page has a skip link.
- Popular has no page heading; For You has no main landmark.
- Several icon-only buttons lack accessible names.
- Formatting toggles do not expose `aria-pressed`.
- Cell editing cannot be initiated and operated fully with a keyboard.
- The board lacks grid/cell coordinates and selection semantics.
- The inspector remains in the accessibility tree when visually hidden.
- The tag chooser is not a keyboard-complete combobox.
- Cards have generic image alternative text.
- There are no explicit `focus-visible` or reduced-motion rules.
- The card layout has no single-column breakpoint and overflows narrow
  viewports.

## Security and supply-chain findings

- No credentials or private keys were found by a pattern scan of the complete
  two-commit history. A dedicated secret scanner was not installed.
- Interpolated `innerHTML` is safe only while card data is hardcoded; connecting
  API content to it would create a stored-XSS path.
- Browser `accept="image/*"` is not validation. There are no byte, dimension,
  MIME, extension, decoder, malware, or quota checks.
- Font Awesome is fetched from a public CDN without Subresource Integrity.
- The source and license of `cover.avif` are undocumented.
- No `LICENSE`, third-party notice, dependency inventory, or SBOM exists.
- There is no root ignore file, increasing the chance of committing future
  secrets and generated files.

## Missing production capabilities

Every server-side product capability in scope starts from zero:

- accounts, email verification, password recovery, and session management;
- profiles and privacy controls;
- bingo persistence, drafts, immutable revisions, tags, and media;
- public/unlisted/private object permissions;
- guest and registered play progress;
- immutable shared results;
- follows, likes, comments, replies, and notifications;
- Explore, Trending, Discover, search, and interaction events;
- reports, moderation actions, suspension, and audit logs;
- OpenAPI, typed clients, background jobs, exports, and admin workflows.

Infrastructure was also absent: PostgreSQL, Redis, Celery, object storage,
containers, health checks, observability, migrations, backups, restore
procedures, CI, and test suites.

## Migration conclusion

There is no production database or user data to transform. Migration is a
behavioral and visual port, not a data migration. Hardcoded cards may be
discarded or moved to a development-only seed command. The legacy files should
remain only until the new routes reach functional and visual parity, then be
removed in one explicit cleanup.

No blocking product question was discovered in the repository.
