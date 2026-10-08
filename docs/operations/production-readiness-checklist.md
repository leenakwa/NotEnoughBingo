# NotEnoughBingo predeployment working checklist

This is the full [user prompt](production-readiness-prompt.txt), copied into an
editable checklist. Every original dash or numbered item has a checkbox; no
requirement has been removed. The original prompt remains authoritative.
Section-level repository results and release-specific applicability are in the
[predeployment tracker](production-readiness-tracker.md). A checked item needs
an observed result in the [evidence log](production-readiness-evidence.md).

---

You are responsible for taking this website/application from its current state to genuinely production-ready.

Your job is NOT merely to inspect the code, fix obvious errors, or make the build pass.

Your job is to audit, fix, test, and verify the entire product from the perspective of:
- [ ] a completely new real user;
- [ ] an existing user;
- [ ] an unauthenticated user;
- [ ] a malicious or careless user;
- [ ] a user on mobile;
- [ ] a user on a slow or unstable connection;
- [ ] a user opening deep links directly;
- [ ] the production infrastructure itself.

Do not declare the application production-ready because the code “looks correct”.

Actually test everything you can.

Do not skip small user-facing details.

Do not leave placeholders, TODOs, localhost references, untested integrations, missing states, broken links, console errors, or known rough edges unless there is a concrete reason they cannot be fixed.

Do not unnecessarily redesign or overengineer working parts of the product. Preserve the existing intended design and functionality unless a change is necessary for correctness, usability, accessibility, security, reliability, or production readiness.

For every issue you find:
- [ ] 1. fix it if reasonably possible;
- [ ] 2. verify the fix;
- [ ] 3. continue auditing.

At the end, provide a concise report containing:
- [ ] what you changed;
- [ ] what you tested;
- [ ] any remaining issues that genuinely require external credentials, business decisions, or unavailable infrastructure.

Follow the checklist below completely.

# 1. BASIC LAUNCH DETAILS

Verify all of the following:

- [x] favicon exists and loads;
- [x] page titles are correct;
- [x] public pages have appropriate meta descriptions;
- [x] Open Graph/social previews are configured;
- [x] logo links to the correct home page;
- [x] real 404 handling exists;
- [x] global/server error handling exists;
- [x] loading states exist;
- [x] empty states exist;
- [x] success states exist;
- [x] errors are understandable;
- [x] submit buttons have loading/disabled states;
- [x] duplicate submission is prevented;
- [x] browser Back/Forward work correctly;
- [x] refreshing nested/deep routes works;
- [x] mobile layout works;
- [x] assets do not reference localhost;
- [x] no mock/demo/test content remains unintentionally;
- [x] no unnecessary console logs/debug UI remain;
- [x] production does not use staging APIs accidentally;
- [x] staging `noindex` has not leaked into production;
- [x] emails use production URLs;
- [x] password reset works;
- [x] logout really clears/invalidate sessions;
- [x] switching accounts cannot reveal the previous user's cached data;
- [x] Safari compatibility is checked;
- [x] a first-time user can understand what the product does and what to do next.

# 2. FIRST-SCREEN / PRODUCT CLARITY

A new visitor should understand within a few seconds:

- [x] what the product is;
- [x] what problem it solves;
- [x] what they can do;
- [x] what the primary CTA is;
- [x] whether signup is required;
- [x] whether it is free/paid if relevant;
- [x] how to begin.

Verify:

- [x] technical/internal terminology is not used unnecessarily;
- [x] primary CTA is obvious;
- [x] competing buttons do not create unnecessary ambiguity;
- [x] copy is understandable to users, not only developers;
- [x] the user does not have to guess the next step.

# 3. NAVIGATION

Verify:

- [x] logo → Home;
- [x] all menu links work;
- [x] current page can be identified where appropriate;
- [x] browser Back works;
- [x] browser Forward works;
- [x] deep links work;
- [x] refreshing nested routes does not 404;
- [x] URL updates appropriately;
- [x] meaningful state can be opened from a copied URL where expected;
- [x] query parameters survive where appropriate;
- [x] there are no navigation dead ends;
- [x] mobile menu closes correctly;
- [x] Escape closes dialogs/dropdowns where appropriate;
- [x] click-outside behavior is sensible;
- [x] anchors are not hidden behind sticky headers.

# 4. UI STATES

For every component that loads or manipulates data, verify relevant states:

- [x] initial;
- [x] loading;
- [x] loaded;
- [x] empty;
- [x] partial;
- [x] error;
- [x] offline;
- [x] retrying;
- [x] permission denied;
- [x] expired session.

Do not allow an empty page/table/dashboard to appear without guidance where an empty state would be useful.

# 5. LOADING UX

Verify:

- [x] requests visibly show progress when appropriate;
- [x] buttons display loading/progress;
- [x] submit cannot be accidentally triggered twice;
- [ ] layout does not jump unnecessarily;
- [x] skeletons resemble final layout if used;
- [x] slow operations do not look frozen;
- [x] large uploads show progress if practical;
- [x] long-running jobs expose status;
- [x] operation completion is clearly communicated.

# 6. ERROR HANDLING

Test and handle relevant responses including:

- [x] 400;
- [x] 401;
- [x] 403;
- [x] 404;
- [x] 409;
- [x] 413;
- [x] 422;
- [x] 429;
- [x] 500;
- [x] timeout;
- [x] network disconnect;
- [x] API outage.

Users should not see raw errors such as stack traces or framework/Axios messages.

Provide human-readable feedback.

Where appropriate:

- [x] allow Retry;
- [x] preserve form contents;
- [x] do not unnecessarily destroy user work;
- [x] send technical details to logs/error monitoring rather than exposing them.

# 7. FORMS

For every form verify:

- [x] every field has an accessible label;
- [x] placeholder is not the only label;
- [ ] required fields are clear;
- [ ] optional fields are clear where useful;
- [x] validation is understandable;
- [x] validation errors appear near the relevant field;
- [x] focus behavior after validation is sensible;
- [x] Enter works appropriately;
- [x] Tab navigation works;
- [ ] browser autofill works where expected;
- [ ] password managers work;
- [x] copy/paste is not unnecessarily blocked;
- [x] accidental whitespace in emails/usernames is handled sensibly;
- [x] email normalization is sensible;
- [x] multiline input handles newlines;
- [ ] long text does not break layout;
- [x] Unicode works;
- [x] emoji works where allowed;
- [x] `'`, `"`, `<`, `>`, `&` do not break rendering;
- [x] very large numeric values are handled;
- [x] negative numbers are handled;
- [x] decimal input is handled correctly;
- [ ] max-length restrictions exist only where appropriate;
- [ ] users know relevant limits;
- [ ] leaving an important dirty form warns the user if losing work would be harmful.

# 8. BUTTONS AND CONTROLS

For each important button/control verify:

- [x] normal state;
- [ ] hover state;
- [x] keyboard focus state;
- [ ] active state;
- [x] disabled state;
- [ ] loading state.

Also verify:

- [x] semantic `<button>` is used for buttons;
- [x] links are links;
- [x] clickable `<div>` is not used unnecessarily;
- [x] pointer/interaction feedback is sensible;
- [x] submit buttons submit only the intended form;
- [x] destructive actions are visually recognizable;
- [x] irreversible actions require confirmation where appropriate;
- [x] confirmation describes exactly what will happen.

# 9. DESTRUCTIVE ACTIONS

Test actions such as:

- [x] delete account;
- [x] delete project;
- [x] remove member;
- [x] reset data;
- [x] disconnect integration.

Verify:

- [x] confirmation exists where needed;
- [x] double-triggering is prevented;
- [x] backend authorization is enforced;
- [x] repeated requests do not corrupt state;
- [x] UI updates after deletion;
- [x] browser Back does not misleadingly resurrect deleted content;
- [x] deleted-object URLs behave sensibly;
- [x] Undo/recovery exists where the product requires it.

# 10. SIGNUP

Test:

- [x] valid email;
- [x] invalid email;
- [x] duplicate email;
- [x] weak password;
- [x] password requirements;
- [x] confirm password if used;
- [x] show/hide password;
- [x] Enter submit;
- [x] verification email;
- [x] verification expiration;
- [x] resend verification;
- [x] old verification links.

# 11. LOGIN

Test:

- [x] valid credentials;
- [x] wrong email;
- [x] wrong password;
- [x] unknown account;
- [x] rate limiting;
- [x] remember-me if used;
- [x] redirect back to intended page;
- [x] already-authenticated user visiting login.

# 12. PASSWORD RESET

Verify:

- [x] Forgot Password exists if authentication uses passwords;
- [x] reset email is actually sent;
- [x] email contains the production URL;
- [x] token expires;
- [x] token reuse is handled correctly;
- [x] password update really changes credentials;
- [x] relevant old sessions are invalidated if intended.

# 13. LOGOUT

Verify:

- [x] session is actually invalidated;
- [x] protected APIs stop working;
- [x] Back button does not expose private content;
- [x] sensitive client cache/local state is cleared where appropriate.

# 14. AUTHORIZATION

Do not confuse authentication with authorization.

Attempt:

- [x] normal user opening an admin URL;
- [x] user A opening user B's resource URL;
- [x] manually modifying resource IDs;
- [x] calling API endpoints directly;
- [x] calling admin endpoints without UI;
- [x] modifying role/client state;
- [x] deleting another user's resource;
- [x] downloading another user's private file.

Security must be enforced server-side.

Hiding a button in the frontend is not authorization.

# 15. ONBOARDING

Verify:

- [x] new accounts do not land in an unexplained empty dashboard;
- [x] there is an obvious first useful action;
- [x] empty states help users begin;
- [x] demo/example data is used only intentionally;
- [x] onboarding can be skipped where appropriate;
- [x] completed onboarding is not shown repeatedly;
- [x] completion state is persisted;
- [x] multi-step setup communicates progress;
- [x] sensible defaults exist.

# 16. EMPTY STATES

Test zero-data conditions for relevant areas, including:

- [x] projects;
- [x] searches;
- [x] notifications;
- [x] files;
- [x] transactions/items;
- [x] team members;
- [x] charts;
- [x] analytics periods;
- [x] any other collections.

Empty states should be intentional, not just blank.

# 17. SEARCH

If search exists, test:

- [x] empty query;
- [x] whitespace;
- [x] one character;
- [x] case differences;
- [x] typo/no match;
- [x] Unicode;
- [x] emoji;
- [x] special characters;
- [x] no results;
- [x] one result;
- [x] many results;
- [x] loading;
- [x] debouncing;
- [x] Enter;
- [x] clearing;
- [x] filters + search;
- [x] URL persistence where appropriate.

# 18. TABLES AND LISTS

Test:

- [x] zero rows;
- [x] one row;
- [x] many rows;
- [x] pagination;
- [x] sorting;
- [x] filtering;
- [x] sorting after filtering;
- [x] no-results state;
- [x] long values;
- [x] long usernames/names;
- [x] missing values;
- [x] null values;
- [x] `undefined` never shown to users;
- [x] header alignment;
- [x] mobile behavior;
- [x] horizontal scroll if required;
- [x] selection state.

# 19. FILE UPLOADS

Test:

- [x] correct file;
- [x] unsupported extension;
- [x] incorrect MIME type;
- [x] oversized file;
- [x] empty file;
- [x] Unicode filename;
- [x] filename with spaces;
- [x] malicious/path-traversal-like filename;
- [x] duplicate filenames;
- [x] cancelled upload;
- [x] failed network;
- [x] upload progress;
- [x] retry;
- [x] access control;
- [x] malicious content handling;
- [x] correct storage permissions.

# 20. IMAGES

Verify:

- [x] useful alt text exists where appropriate;
- [x] decorative images do not create screen-reader noise;
- [x] broken images degrade gracefully;
- [x] aspect ratio is preserved;
- [x] massive originals are not unnecessarily delivered;
- [x] lazy loading is used where appropriate;
- [x] placeholders/loading are sensible;
- [x] high-DPI rendering is acceptable;
- [x] user-generated images are served safely;
- [x] thumbnails do not fetch unnecessarily huge originals.

# 21. RESPONSIVE DESIGN

Test at minimum:

- [x] ~320 px;
- [x] ~375 px;
- [x] ~430 px;
- [x] tablet;
- [x] laptop;
- [x] 1440 px desktop;
- [x] ultrawide.

Also test:

- [x] mobile landscape;
- [ ] dynamic browser chrome/address bars;
- [ ] virtual keyboard;
- [ ] iPhone safe areas/notches;
- [x] bottom fixed navigation;
- [ ] modal + virtual keyboard;
- [x] sticky headers;
- [x] accidental horizontal overflow;
- [x] tables;
- [x] charts;
- [x] tooltips.

# 22. TOUCH UX

Verify:

- [x] important actions do not require hover;
- [x] tap targets are sufficiently usable;
- [x] controls are not packed too tightly;
- [x] dropdowns work by tap;
- [x] essential drag interactions have reasonable alternatives when necessary;
- [x] tooltips do not contain the only access to essential information;
- [x] swipe is not the sole method for critical interaction unless intentionally appropriate.

# 23. KEYBOARD UX

Navigate important flows without a mouse.

Verify:

- [x] Tab order;
- [x] Shift+Tab;
- [x] visible focus;
- [x] Enter;
- [x] Space;
- [x] Escape;
- [x] modal focus trapping;
- [x] focus does not escape behind modals;
- [x] focus returns sensibly after closing dialogs;
- [x] no keyboard traps.

# 24. ACCESSIBILITY

Check:

- [x] semantic HTML;
- [x] logical H1 usage;
- [x] heading hierarchy;
- [x] buttons use button semantics;
- [x] links use link semantics;
- [x] labels;
- [x] alt text;
- [x] keyboard use;
- [x] visible focus;
- [x] accessible names;
- [x] ARIA only where needed;
- [x] correct modal semantics;
- [x] form errors accessible to assistive technologies;
- [x] color is not the sole state indicator;
- [x] reduced-motion preference;
- [x] 200% zoom;
- [x] text contrast roughly satisfies WCAG AA expectations;
- [x] large-text/UI contrast is reasonable.

Do not degrade existing accessibility while making other fixes.

# 25. COPY AND PLACEHOLDERS

Search the repository and visible product for accidental leftovers such as:

- [x] `Lorem`;
- [x] `TODO`;
- [x] `FIXME`;
- [x] `test`;
- [x] `dummy`;
- [x] `example.com`;
- [x] `John Doe`;
- [x] `foo`;
- [x] `bar`;
- [x] `localhost`;
- [x] `127.0.0.1`;
- [x] staging URLs;
- [ ] temporary copy;
- [x] obsolete “Coming soon” text.

Verify:

- [x] consistent capitalization;
- [x] consistent terminology;
- [x] product name is consistent;
- [x] sign-in/login terminology is consistent;
- [ ] error messages are user-facing;
- [ ] internal enum/debug values never appear to users.

# 26. LONG-CONTENT TORTURE TEST

Test relevant fields with:

- [x] 100-character username/name;
- [x] 200-character project/item name;
- [x] very long email;
- [x] very long URL;
- [x] long unbroken string;
- [x] emoji;
- [x] Cyrillic;
- [x] Chinese or another non-Latin script;
- [x] empty string;
- [x] very large text content.

Check:

- [ ] wrapping;
- [ ] overflow;
- [x] truncation;
- [x] layout stability;
- [x] useful tooltip/full-view behavior for truncated content where appropriate.

# 27. DATES AND TIME

Verify:

- [x] timezone strategy is defined;
- [x] backend timestamps are consistent;
- [x] users see appropriate local times;
- [x] DST behavior;
- [x] end of month;
- [x] end of year;
- [x] leap year;
- [x] today/yesterday logic;
- [x] timestamps around midnight;
- [x] sorting is based on actual date/time, not formatted strings;
- [x] serialization does not shift dates unexpectedly.

# 28. NUMBERS

Test:

- [x] zero;
- [x] negative values;
- [x] very large values;
- [x] very small values;
- [x] decimal rounding;
- [x] percentages;
- [x] currencies;
- [x] thousands/decimal separators;
- [x] null;
- [x] NaN;
- [x] Infinity.

Never display things such as:

`NaN €`

or:

`undefined%`

# 29. LOCALIZATION / INTERNATIONALIZATION

Even if only one language currently exists:

- [x] set appropriate `<html lang>`;
- [x] format dates intentionally;
- [x] format numbers intentionally;
- [x] format currency correctly;
- [x] pluralization is correct;
- [x] avoid unnecessary hardcoding if internationalization is clearly planned;
- [x] layout tolerates longer translated strings;
- [x] emails use the intended language.

If multiple languages exist:

- [x] test fallback behavior;
- [x] language switching;
- [x] URL strategy;
- [x] hreflang where appropriate;
- [x] untranslated translation keys never appear.

# 30. 404 HANDLING

Verify:

- [x] unknown routes;
- [x] malformed IDs;
- [x] deleted objects;
- [x] old routes.

The user should get:

- [x] clear explanation;
- [x] way back home/navigation;
- [x] correct server status when applicable.

Do not return HTTP 200 for truly missing public SSR pages if correct 404 semantics are possible.

# 31. GLOBAL / 500 ERROR HANDLING

Verify:

- [x] frontend Error Boundary or equivalent;
- [x] backend global error handler;
- [x] friendly error state;
- [x] retry where appropriate;
- [x] technical error is logged;
- [x] stack traces/secrets are not exposed;
- [x] request/event IDs are available if useful.

# 32. OFFLINE / BAD NETWORK

Test:

- [x] Offline;
- [x] slow connection;
- [x] high latency;
- [x] timeout;
- [x] failed requests.

Verify:

- [x] app does not appear frozen forever;
- [x] sensible timeout behavior exists;
- [x] user understands what happened;
- [x] Retry exists where useful;
- [x] failed optimistic updates roll back;
- [x] unsaved work is preserved when practical.

# 33. BROWSER COMPATIBILITY

Test important functionality in:

- [x] Chrome;
- [x] Safari;
- [x] Firefox;
- [ ] Edge;
- [ ] iOS Safari;
- [ ] Android Chrome.

Pay particular attention to Safari-specific issues.

# 34. PERFORMANCE

Review:

- [x] initial JavaScript bundle size;
- [x] unnecessary dependencies;
- [x] code splitting;
- [x] lazy loading;
- [x] image optimization;
- [x] font loading;
- [x] unused fonts;
- [x] N+1 backend/database requests;
- [x] excessive requests on dashboards/pages;
- [x] DB indexes;
- [x] pagination;
- [x] compression;
- [ ] static asset CDN if appropriate;
- [x] cache headers;
- [x] cache invalidation;
- [x] third-party scripts;
- [x] layout shifts.

Do not perform premature micro-optimization, but fix obvious production performance problems.

# 35. FONTS

Verify:

- [x] font files exist in production;
- [x] asset paths match case exactly;
- [x] no 404s;
- [x] sensible fallback;
- [x] required Cyrillic/Unicode coverage exists;
- [x] required font weights actually exist;
- [x] browser does not need to synthesize inappropriate weights;
- [x] text remains visible during loading.

# 36. SEO FOR PUBLIC PAGES

If pages should be indexed, verify:

- [x] unique title;
- [x] sensible meta description;
- [x] meaningful H1;
- [x] semantic headings;
- [x] canonical URL;
- [x] crawlable links;
- [x] clean meaningful URLs;
- [x] sitemap.xml;
- [x] robots.txt;
- [x] correct HTTP statuses;
- [ ] www/non-www policy;
- [ ] HTTP → HTTPS;
- [x] trailing slash strategy;
- [x] duplicate URL handling;
- [x] no accidental `noindex`;
- [x] preview/staging deployments are not indexed;
- [x] structured data if the site actually benefits from it.

# 37. SOCIAL SHARING

Test a production URL preview in services such as:

- [ ] Telegram;
- [ ] Discord;
- [ ] Slack;
- [ ] iMessage/WhatsApp;
- [ ] LinkedIn.

Verify:

- [x] Open Graph title;
- [x] description;
- [x] image;
- [x] absolute image URL;
- [x] correct favicon/site branding;
- [ ] no stale staging metadata;
- [x] sensible image aspect ratio.

# 38. DOMAIN AND DNS

Verify:

- [ ] custom production domain;
- [ ] DNS;
- [ ] `www` behavior;
- [ ] bare/root domain behavior;
- [ ] one canonical host;
- [ ] redirect from alternate host;
- [ ] old domains redirect or are intentionally disabled;
- [x] preview deployments are not unintentionally indexed;
- [ ] cookie domain is correct.

# 39. HTTPS / TLS

Verify:

- [ ] HTTPS works;
- [ ] HTTP redirects to HTTPS;
- [ ] certificate is valid;
- [ ] renewal is automatic where applicable;
- [ ] no mixed-content warnings;
- [ ] WebSockets use secure transport;
- [ ] API uses HTTPS;
- [ ] all fonts/images/scripts use appropriate secure URLs.

# 40. ENVIRONMENT VARIABLES

Audit all relevant production variables, including:

- [x] frontend API URL;
- [x] backend URL;
- [ ] DB URL;
- [ ] storage configuration;
- [ ] email provider;
- [x] OAuth credentials;
- [x] OAuth redirects;
- [x] payment keys;
- [ ] analytics;
- [ ] error monitoring;
- [x] webhook secrets;
- [x] cron secrets;
- [x] feature flags;
- [ ] app origin/base URL;
- [x] cookie config.

Verify:

- [x] production does not silently assume a developer's local `.env`;
- [x] secrets do not enter client bundles;
- [x] build-time and runtime variables are understood;
- [x] fallback values never accidentally point to localhost/staging.

# 41. SECRETS

Search repository/current configuration/history where possible for:

- [x] API keys;
- [x] DB passwords;
- [x] tokens;
- [x] private keys;
- [x] `.env`;
- [x] OAuth secrets.

If a real secret has been committed, removing the visible line is not enough: flag that the secret should be rotated.

Never expose secrets in the final report.

# 42. DATABASE

Before launch verify:

- [x] backups;
- [x] migrations;
- [x] migrations tested against realistic existing data;
- [x] deployment compatibility;
- [x] indexes;
- [x] constraints;
- [x] unique constraints;
- [x] foreign keys;
- [x] nullable fields;
- [x] defaults;
- [x] transactions;
- [x] rollback/migration strategy.

Test:

- [x] existing users survive schema changes;
- [x] old rows missing new fields;
- [x] large-table migrations;
- [x] deployment/migration order.

# 43. DATA INTEGRITY

Verify behavior for:

- [x] duplicate submit;
- [x] duplicate webhook;
- [x] concurrent edits;
- [x] race conditions;
- [x] optimistic UI conflicts;
- [x] parent/child deletion;
- [x] orphan prevention;
- [x] repeated API calls;
- [x] relevant idempotency.

# 44. BACKUPS

Verify:

- [ ] backups actually exist;
- [ ] backups run automatically if expected;
- [ ] retention is defined;
- [ ] backups are not only on the same failing machine;
- [x] restore procedure is known;
- [x] restore has been tested if possible.

# 45. EMAILS

If any emails exist, test all relevant types:

- [x] registration;
- [x] verification;
- [x] password reset;
- [x] notifications;
- [ ] invitations;
- [ ] receipts.

For each verify:

- [ ] production URLs;
- [ ] From name;
- [ ] From address;
- [ ] Reply-To where appropriate;
- [ ] subject;
- [x] plain-text fallback where relevant;
- [ ] mobile rendering;
- [ ] acceptable dark-mode rendering;
- [ ] links;
- [ ] expired links;
- [ ] branding;
- [ ] support contact.

Infrastructure:

- [ ] SPF;
- [ ] DKIM;
- [ ] DMARC where appropriate;
- [ ] production provider mode;
- [ ] sender domain verification;
- [ ] provider rate limits.

# 46. NOTIFICATIONS

If notifications exist, test:

- [x] creation;
- [x] unread count;
- [x] read/unread;
- [x] click destination;
- [x] target object deleted;
- [x] user no longer has access;
- [x] duplicate prevention;
- [x] timestamp formatting;
- [x] Mark All Read.

# 47. OAUTH / SOCIAL LOGIN

For Google/GitHub/etc. verify:

- [ ] production provider app/config;
- [ ] production callback URL;
- [ ] exact protocol/domain/path;
- [ ] correct client ID;
- [ ] client secret server-side only;
- [ ] production consent screen if required;
- [ ] logout;
- [ ] account linking;
- [ ] account already exists with same email;
- [ ] provider supplies incomplete data;
- [ ] user revokes provider access.

# 48. PAYMENTS

If payments exist, test:

- [ ] production API keys;
- [ ] correct live prices/products;
- [ ] currency;
- [ ] amount;
- [ ] tax where applicable;
- [ ] success;
- [ ] decline;
- [ ] abandoned checkout;
- [ ] retry;
- [ ] duplicate click;
- [ ] duplicate webhook;
- [ ] webhook signatures;
- [ ] delayed webhook;
- [ ] out-of-order webhook;
- [ ] refund;
- [ ] subscription cancellation;
- [ ] renewal;
- [ ] failed recurring payment;
- [ ] upgrade;
- [ ] downgrade;
- [ ] invoice/receipt;
- [ ] client cannot forge payment success.

# 49. WEBHOOKS

Verify:

- [ ] endpoint is publicly reachable;
- [ ] HTTPS;
- [ ] signature verification;
- [ ] idempotency;
- [ ] retry handling;
- [ ] duplicate events;
- [ ] out-of-order events;
- [ ] fast acknowledgement/timeout handling;
- [ ] heavier processing can happen asynchronously where needed;
- [ ] event IDs are logged.

# 50. SECURITY HEADERS

Review and configure appropriately:

- [x] Content-Security-Policy;
- [ ] HSTS;
- [x] `X-Content-Type-Options`;
- [x] frame/clickjacking protection;
- [x] Referrer-Policy;
- [x] Permissions-Policy.

Do not blindly paste a restrictive policy that breaks real app resources. Verify the resulting app works.

# 51. COOKIES

Verify session/security cookies:

- [x] `Secure`;
- [x] `HttpOnly` where appropriate;
- [x] correct `SameSite`;
- [ ] correct expiry;
- [x] logout invalidation;
- [ ] correct production domain/path;
- [x] frontend JS cannot access sensitive cookies unnecessarily.

# 52. BASIC SECURITY ABUSE TESTS

Test inputs such as:

- [x] HTML;
- [x] `<script>`;
- [x] SQL-looking strings;
- [x] URL injection;
- [x] path traversal strings;
- [x] huge payloads;
- [x] rapid repeated requests;
- [x] brute-force-like login attempts;
- [x] malicious filenames;
- [x] malformed JSON;
- [x] unexpected enum values;
- [x] negative IDs;
- [x] another user's UUID/ID.

Verify input validation, output escaping, access control, and rate limiting.

# 53. RATE LIMITING

Protect relevant endpoints such as:

- [x] login;
- [x] signup;
- [x] password reset;
- [x] email sending;
- [x] expensive AI endpoints;
- [x] uploads;
- [x] search;
- [x] public APIs.

Make rate-limit responses understandable.

# 54. AI/LLM FEATURES

If the application uses AI/LLMs, test:

- [ ] loading;
- [ ] streaming;
- [ ] cancellation;
- [ ] retry;
- [ ] provider timeout;
- [ ] provider outage;
- [ ] empty output;
- [ ] markdown sanitization;
- [ ] code blocks;
- [ ] very large input;
- [ ] context/token limits;
- [ ] oversized file;
- [ ] unsupported file;
- [ ] concurrent generations;
- [ ] double submit;
- [ ] usage limits;
- [ ] user-context isolation;
- [ ] one user's private content never appears in another user's context;
- [ ] prompt injection risks around tools/retrieved content;
- [ ] tool calls enforce server-side permissions;
- [ ] destructive tool actions require confirmation where appropriate;
- [ ] streaming errors/reconnection.

# 55. PRIVACY

Review:

- [ ] Privacy Policy if required;
- [ ] Terms if required;
- [ ] cookie/consent mechanisms if required;
- [x] data collection;
- [x] account deletion;
- [x] data export if supported/required;
- [x] analytics data;
- [x] passwords are never logged;
- [x] tokens are never logged;
- [ ] sensitive information is not unnecessarily put into query params;
- [ ] third-party processors/services are accounted for.

# 56. ACCOUNT SETTINGS

Test:

- [x] change name;
- [x] change email;
- [x] email reverification;
- [x] change password;
- [x] forgotten-current-password path;
- [x] logout;
- [x] logout-all-devices if supported;
- [x] delete account;
- [x] delete confirmation;
- [x] actual deletion/anonymization behavior;
- [x] avatar upload/delete;
- [x] timezone/preferences persistence.

# 57. TEAMS / ORGANIZATIONS

If relevant, test:

- [ ] invite;
- [ ] expired invite;
- [ ] duplicate invite;
- [ ] already-a-member invite;
- [ ] revoke invite;
- [ ] remove member;
- [ ] leave team;
- [ ] owner transfer;
- [ ] owner cannot accidentally orphan organization;
- [ ] roles;
- [ ] role downgrade;
- [ ] admin permissions;
- [ ] deleted users;
- [ ] concurrent edits.

# 58. BROWSER STORAGE

Verify:

- [x] localStorage/sessionStorage schema changes;
- [x] stale data from older app versions;
- [x] corrupted JSON/data;
- [x] incognito/private browsing where relevant;
- [x] unavailable storage;
- [x] logout clears sensitive local state;
- [x] user A's local data does not appear for user B on the same device.

# 59. CACHE

Verify:

- [x] HTML is not accidentally cached forever;
- [x] hashed assets may be cached aggressively;
- [x] old JS/new HTML incompatibility is prevented;
- [x] service worker does not pin obsolete builds;
- [ ] CDN invalidation/update strategy works;
- [x] private API responses are not publicly cached;
- [x] logout does not leave unsafe cached private pages/data.

# 60. SERVICE WORKER / PWA

If a service worker/PWA exists, verify:

- [x] update strategy;
- [x] stale tabs;
- [x] stale cache;
- [x] offline behavior;
- [x] manifest;
- [x] icons;
- [x] install flow;
- [x] new releases reach users.

If a PWA is not required, ensure a leftover service worker/template does not interfere with deployments.

# 61. ANALYTICS

If analytics is used, verify:

- [ ] production property/project;
- [ ] staging/local development does not pollute production metrics;
- [x] page views;
- [x] signup;
- [x] login;
- [x] primary CTA;
- [x] main success event;
- [x] conversions;
- [x] payment success if applicable;
- [x] useful funnel events.

Never send sensitive content such as:

- [x] passwords;
- [x] tokens;
- [x] private messages;
- [x] sensitive form values.

# 62. PRODUCT METRICS

Ensure the product can measure the important funnel where relevant:

visitor → signup → activation → core action → return

The data should allow the team to understand:

- [x] how many users arrived;
- [x] how many registered;
- [x] how many actually used the core feature;
- [x] where users drop off.

# 63. ERROR TRACKING

Verify a production error-monitoring system if one is expected:

- [ ] production environment;
- [x] release/version tagging;
- [x] source maps configured appropriately;
- [x] PII filtering;
- [x] frontend errors;
- [x] backend errors;
- [x] unhandled promises;
- [x] API failures.

# 64. LOGGING

Logs should contain enough information to debug incidents, such as:

- [x] timestamp;
- [x] severity;
- [x] action/route;
- [x] request ID/correlation ID where useful;
- [x] error information;
- [x] useful non-sensitive context.

Never log:

- [x] passwords;
- [x] auth tokens;
- [x] API secrets;
- [x] private keys;
- [x] payment-card data;
- [x] unnecessarily large sensitive request bodies.

# 65. MONITORING

Where infrastructure supports it, verify:

- [ ] uptime;
- [ ] frontend availability;
- [ ] API health;
- [ ] DB health;
- [ ] background workers;
- [ ] cron jobs;
- [ ] queues;
- [ ] storage/disk limits;
- [ ] error rate;
- [ ] latency.

# 66. ALERTS

Monitoring should have actionable alerts where appropriate for:

- [ ] site down;
- [ ] 5xx spike;
- [ ] database inaccessible;
- [ ] repeated worker failures;
- [ ] payment webhook failure;
- [ ] email provider failure;
- [ ] storage exhaustion;
- [ ] other critical dependencies.

# 67. HEALTH ENDPOINT

If appropriate, ensure the application has useful health/readiness checks.

Distinguish where needed between:

- [x] process alive;
- [x] application ready;
- [x] DB reachable;
- [ ] required dependencies available.

Health output must not leak secrets/configuration.

# 68. CRON / SCHEDULED JOBS

If scheduled jobs exist, verify:

- [ ] the scheduler is actually configured in production;
- [x] timezone;
- [x] retry behavior;
- [x] duplicate execution;
- [x] overlapping execution;
- [x] logging;
- [ ] failure alerting;
- [x] idempotency.

Do not assume that writing cron-job code means the job is actually scheduled.

# 69. QUEUES / WORKERS

If background queues/workers exist, verify:

- [x] worker is actually running;
- [ ] correct production queue;
- [x] retry policy;
- [x] failed/dead-letter handling;
- [x] persistence across restart where appropriate;
- [x] duplicate-job safety;
- [x] visibility/lock timeout behavior;
- [x] failures are observable.

# 70. PRODUCTION BUILD

Do not rely only on development mode.

Run the actual production-equivalent commands, for example:

`npm run build`
`npm run start`

or the framework equivalent.

Verify:

- [x] build completes;
- [x] production environment variables are used;
- [x] production/minified build works;
- [x] dynamic imports work;
- [x] SSR works if used;
- [x] static generation works if used;
- [x] routes work;
- [x] assets load;
- [x] source maps are intentionally configured;
- [x] browser console is clean.

# 71. DEPENDENCIES

Verify:

- [x] lockfile is committed;
- [x] clean install succeeds;
- [x] clean build succeeds;
- [x] application does not rely on globally installed developer packages;
- [x] runtime version is pinned/documented;
- [x] Node/Python/etc. versions match production;
- [x] native packages work on production architecture.

# 72. CI/CD

A reasonable production pipeline should include relevant stages such as:

install
→ lint
→ typecheck
→ tests
→ build
→ deploy
→ smoke test

At minimum, production build must be validated before deployment.

# 73. TESTS

Do not chase arbitrary test coverage, but ensure critical paths are tested where practical:

- [x] signup;
- [x] login;
- [x] authorization;
- [x] core action;
- [x] saving;
- [x] payments;
- [x] account deletion;
- [x] critical API endpoints;
- [x] important calculations/business logic.

# 74. PRODUCTION SMOKE TEST

After actual deployment, test against the real production URL.

As anonymous user:

- [ ] open home;
- [ ] use navigation;
- [ ] open invalid URL;
- [ ] sign up.

As a new user:

- [ ] register;
- [ ] receive email if applicable;
- [ ] verify account;
- [ ] log in;
- [ ] complete onboarding;
- [ ] perform the primary product action;
- [ ] refresh page;
- [ ] verify data persisted;
- [ ] log out.

As an existing user:

- [ ] log in;
- [ ] verify existing data;
- [ ] modify something;
- [ ] refresh;
- [ ] verify persistence.

On another browser/device:

- [ ] log in;
- [ ] verify server-synced data;
- [ ] confirm the application does not depend on local developer-machine state.

# 75. BROWSER CONSOLE

On every major production page, inspect the browser console.

Resolve or justify:

- [x] errors;
- [x] hydration issues;
- [x] missing keys;
- [x] CSP violations;
- [x] failed assets;
- [x] deprecated critical APIs;
- [x] mixed content.

There should be zero unexplained production console errors.

# 76. NETWORK PANEL

Inspect actual production network traffic.

Look for:

- [x] 404 assets;
- [x] 401s;
- [x] 500s;
- [x] redirect loops;
- [x] localhost requests;
- [x] staging requests;
- [ ] duplicate requests;
- [ ] unnecessarily huge responses;
- [ ] tokens/secrets in URLs;
- [ ] sensitive information unnecessarily exposed in responses.

# 77. HTTP STATUS CODES

Verify appropriate behavior such as:

- [x] `/` → 200;
- [x] valid page → 200;
- [x] missing page → 404;
- [x] permanent move → 301/308 as appropriate;
- [x] unauthenticated API → 401;
- [x] forbidden → 403.

Do not let a SPA visually display 404 while the server incorrectly returns 200 for public pages if correct status handling is possible.

# 78. REDIRECTS

Verify:

- [ ] HTTP → HTTPS;
- [ ] www ↔ non-www;
- [ ] old URLs;
- [ ] renamed routes;
- [x] login redirect;
- [x] logout redirect;
- [x] no redirect loops;
- [x] relevant query parameters survive;
- [x] permanent redirects use appropriate permanent status.

# 79. STATIC ASSETS

Verify production access to:

- [x] logo;
- [x] favicon;
- [x] icons;
- [x] fonts;
- [x] images;
- [x] manifest;
- [x] downloads/static documents.

Check case-sensitive paths carefully.

Example:

`Logo.png`

is not the same as:

`logo.png`

on many production systems.

# 80. PUBLIC FILE EXPOSURE

Verify sensitive files are not publicly downloadable, including things like:

- [x] `.env`;
- [x] `.git`;
- [x] SQLite/database files;
- [x] backups;
- [x] SQL dumps;
- [x] internal configuration;
- [x] private keys;
- [x] logs.

# 81. SOURCE MAPS

Make an explicit decision about source maps:

- [x] public or private;
- [x] uploaded to monitoring provider;
- [x] whether they expose source code/internal details;
- [x] whether they are required for debugging.

Do not leave this accidental.

# 82. API READINESS

For every important API endpoint verify relevant:

- [x] input validation;
- [x] authentication;
- [x] authorization;
- [x] rate limiting;
- [x] understandable error responses;
- [x] stable response schema;
- [x] timeout;
- [x] pagination;
- [x] request-size limits;
- [x] logging;
- [x] secrets not exposed;
- [x] idempotency where required.

# 83. CORS

Verify:

- [x] production frontend origin is allowed;
- [ ] staging is handled intentionally;
- [x] localhost is not unnecessarily allowed in production;
- [x] wildcard origin is not incorrectly combined with credentials;
- [x] cookies/credentials actually work;
- [x] preflight requests work.

# 84. FEATURE FLAGS

Verify:

- [x] unfinished features are disabled;
- [x] experimental UI does not accidentally appear;
- [x] production defaults are correct;
- [x] missing remote flags have safe fallback;
- [x] admin/debug behavior cannot be enabled by arbitrary users through query params/client state.

# 85. DEBUG ARTIFACTS

Search for and review:

- [x] `console.log`;
- [x] `alert(`;
- [x] `debugger`;
- [x] `TODO`;
- [x] `FIXME`;
- [x] `DEV`;
- [x] `MOCK`;
- [x] `localhost`;
- [x] fake emails;
- [x] hardcoded test credentials.

Also inspect for:

- [x] debug panels;
- [x] admin shortcuts;
- [x] fake-auth modes;
- [x] payment bypasses;
- [x] seed buttons;
- [x] hidden development routes.

Remove anything inappropriate for production.

# 86. TEST / DEMO ACCOUNTS

Verify:

- [ ] test users do not have inappropriate production permissions;
- [x] demo data is clearly intentional;
- [ ] staging data is not accidentally mixed with production;
- [x] test payments do not pollute live payment systems.

# 87. ADMIN PANEL

If an admin interface exists:

- [x] do not rely on obscurity;
- [x] authenticate;
- [x] authorize;
- [x] log important admin actions where appropriate;
- [x] confirm destructive actions;
- [x] support safe pagination/search;
- [x] prevent accidental mass production-data destruction.

# 88. SUPPORT

Users need a real way to get help.

Verify:

- [ ] contact/support channel exists;
- [ ] support email/form works;
- [ ] links work;
- [ ] sender/reply behavior works;
- [ ] support destination actually exists.

# 89. LEGAL / BUSINESS FOOTER

Where applicable verify:

- [x] Privacy;
- [x] Terms;
- [x] Cookies;
- [ ] Contact;
- [ ] legal/company identity;
- [x] correct copyright year.

Do not leave outdated years or template company information.

# 90. FOOTER

Check:

- [x] links work;
- [x] Privacy;
- [x] Terms;
- [x] Contact;
- [x] social links;
- [x] copyright;
- [x] current year;
- [x] logo/branding;
- [x] no links pointing only to `#` unintentionally.

# 91. PAGE METADATA

Inspect rendered production source/head for expected tags such as:

- [x] `<title>`;
- [x] meta description;
- [x] Open Graph title;
- [x] Open Graph description;
- [x] Open Graph image;
- [x] Open Graph URL;
- [x] canonical;
- [x] favicon.

# 92. FAVICON SET

Verify relevant assets such as:

- [x] favicon.ico;
- [x] browser favicon;
- [x] Apple touch icon;
- [x] PWA icons if applicable;
- [ ] visibility on both light/dark browser chrome.

# 93. SCROLL BEHAVIOR

Verify:

- [x] route changes scroll sensibly;
- [x] Back restores scroll where expected;
- [x] closing modal restores `body` scrolling;
- [x] no accidental horizontal scroll;
- [x] sticky UI does not hide important content.

# 94. MODALS

Test:

- [x] close X;
- [x] Cancel;
- [x] Escape;
- [x] backdrop click if intentionally supported;
- [x] focus trap;
- [x] body scroll lock;
- [x] mobile;
- [x] long modal content;
- [x] destructive-action clarity.

# 95. DROPDOWNS / POPOVERS

Test:

- [x] open;
- [x] close;
- [x] keyboard;
- [x] mobile;
- [x] clipping by parent overflow;
- [x] screen-edge positioning;
- [x] z-index;
- [x] behavior while page scrolls.

# 96. Z-INDEX / OVERLAY STACK

Test combinations of:

- [x] sticky headers;
- [x] dropdowns;
- [x] modals;
- [x] toasts;
- [x] tooltips;
- [x] date pickers.

Avoid arbitrary extreme z-index values that create future collisions.

# 97. TOASTS / TRANSIENT FEEDBACK

Verify:

- [ ] success toast;
- [ ] error toast;
- [ ] duplicates are controlled;
- [ ] messages stay visible long enough;
- [ ] critical information is not available only through a disappearing toast;
- [ ] mobile toasts do not cover essential controls.

# 98. ACTION FEEDBACK

After actions such as:

- [x] Save;
- [x] Upload;
- [x] Submit;
- [x] Delete;
- [x] Invite;
- [x] Payment;

the user must clearly know whether the action succeeded, failed, or is still running.

# 99. REFRESH TEST

Press Refresh/Cmd+R/Ctrl+R on every important route/state, especially:

- [x] dashboard;
- [x] editor;
- [x] checkout success;
- [x] OAuth callback;
- [x] password-reset page;
- [x] nested SPA routes;
- [x] shared links.

# 100. OPEN-IN-NEW-TAB TEST

Open important links/routes directly in a new tab.

Verify:

- [x] route works independently;
- [x] required data loads from the server;
- [x] page does not depend on hidden in-memory state from a previous route.

# 101. MULTIPLE TABS

Test:

- [x] login/logout behavior across tabs;
- [x] stale data;
- [x] token refresh;
- [x] concurrent edits;
- [x] same action submitted from multiple tabs.

# 102. SESSION EXPIRATION

Simulate an expired session while the app is open.

Verify:

- [x] app does not produce a flood of repeated failures;
- [x] user understands they need to log in again;
- [x] redirect works;
- [x] unsaved state is preserved where practical;
- [x] successful re-login returns them to the appropriate place.

# 103. VERSION / DEPLOYMENT COMPATIBILITY

Remember that during rollout users may temporarily have:

- [x] old frontend + new backend;
- [x] new frontend + old backend.

Avoid incompatible migrations/API changes during rollout where possible.

# 104. ROLLBACK

Before declaring production ready, determine:

- [ ] previous deployment can be restored;
- [ ] rollback process/command is known;
- [x] database migration is reversible or backward compatible;
- [ ] previous config remains available;
- [x] risky features can be disabled quickly where feature flags exist.

# 105. FINAL EXECUTION SEQUENCE

Do not merely read this list.

Actually perform as much of the following sequence as the environment permits:

- [x] 1. perform clean dependency installation;
- [x] 2. run lint;
- [x] 3. run typecheck;
- [x] 4. run tests;
- [x] 5. run the production build;
- [x] 6. run production build locally if possible;
- [x] 7. test all major routes;
- [x] 8. search repository for localhost/TODO/FIXME/mocks/test credentials/secrets/debugging leftovers;
- [x] 9. inspect configuration and environment assumptions;
- [ ] 10. deploy to the real production environment if deployment is part of your task and credentials/access are available;
- [ ] 11. open the actual production URL;
- [ ] 12. test as an anonymous user;
- [ ] 13. create a completely new account;
- [ ] 14. test email verification if applicable;
- [ ] 15. log in;
- [ ] 16. complete onboarding;
- [ ] 17. execute the primary product workflow;
- [ ] 18. create/edit/save real test data;
- [ ] 19. refresh;
- [ ] 20. verify persistence;
- [ ] 21. log out;
- [ ] 22. log back in;
- [ ] 23. verify existing data;
- [ ] 24. test a second user/account where authorization matters;
- [ ] 25. test mobile;
- [ ] 26. test Safari if accessible;
- [ ] 27. inspect browser console;
- [ ] 28. inspect network requests;
- [ ] 29. test unknown/404 URLs;
- [ ] 30. deliberately trigger an application/API error;
- [ ] 31. test empty states;
- [ ] 32. test invalid form input;
- [ ] 33. test slow connection/offline behavior;
- [ ] 34. test direct/deep links;
- [ ] 35. test refresh on deep links;
- [ ] 36. test opening important URLs in a new tab;
- [ ] 37. test account/session expiration if possible;
- [ ] 38. inspect server/application logs;
- [ ] 39. confirm error tracking/monitoring works if configured;
- [ ] 40. confirm background workers/cron jobs actually run if relevant;
- [ ] 41. confirm emails/webhooks/payment integrations in production if relevant;
- [ ] 42. confirm no unresolved critical or obvious user-facing issues remain.

# DEFINITION OF DONE

Do NOT infer that a feature works from reading the code.

Test it.

For every meaningful user-facing feature, explicitly consider and test:

- [ ] happy path;
- [ ] loading state;
- [ ] empty state;
- [ ] success state;
- [ ] error state;
- [ ] invalid input;
- [ ] edge-case content;
- [ ] authorization boundary;
- [ ] refresh behavior;
- [ ] direct/deep-link behavior;
- [ ] mobile behavior;
- [ ] keyboard behavior where relevant;
- [ ] slow-network behavior where relevant.

The application is NOT production-ready while any unexplained:

- [ ] broken links;
- [ ] missing states;
- [ ] localhost references;
- [ ] staging URLs;
- [ ] test/mock data;
- [ ] placeholder copy;
- [ ] production console errors;
- [ ] broken assets;
- [ ] missing metadata;
- [ ] missing user feedback;
- [ ] inaccessible essential controls;
- [ ] unsafe authorization;
- [ ] exposed secrets;
- [ ] untested critical integrations;
- [ ] broken mobile views;
- [ ] broken direct links;
- [ ] broken refresh behavior;
- [ ] critical TODOs;
- [ ] debug features

remain.

Do not stop at “the build succeeds”.

The final standard is:

A completely new real user must be able to discover the product, understand it, sign up if required, use its primary functionality, recover from ordinary mistakes and failures, refresh and return later, use it on common devices, and trust that their data and account are handled correctly — on the actual production deployment.
