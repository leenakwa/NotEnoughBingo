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

- [ ] favicon exists and loads;
- [ ] page titles are correct;
- [ ] public pages have appropriate meta descriptions;
- [ ] Open Graph/social previews are configured;
- [ ] logo links to the correct home page;
- [ ] real 404 handling exists;
- [ ] global/server error handling exists;
- [ ] loading states exist;
- [ ] empty states exist;
- [ ] success states exist;
- [ ] errors are understandable;
- [ ] submit buttons have loading/disabled states;
- [ ] duplicate submission is prevented;
- [ ] browser Back/Forward work correctly;
- [ ] refreshing nested/deep routes works;
- [ ] mobile layout works;
- [ ] assets do not reference localhost;
- [ ] no mock/demo/test content remains unintentionally;
- [ ] no unnecessary console logs/debug UI remain;
- [ ] production does not use staging APIs accidentally;
- [ ] staging `noindex` has not leaked into production;
- [ ] emails use production URLs;
- [ ] password reset works;
- [ ] logout really clears/invalidate sessions;
- [ ] switching accounts cannot reveal the previous user's cached data;
- [ ] Safari compatibility is checked;
- [ ] a first-time user can understand what the product does and what to do next.

# 2. FIRST-SCREEN / PRODUCT CLARITY

A new visitor should understand within a few seconds:

- [x] what the product is;
- [ ] what problem it solves;
- [x] what they can do;
- [x] what the primary CTA is;
- [x] whether signup is required;
- [ ] whether it is free/paid if relevant;
- [x] how to begin.

Verify:

- [x] technical/internal terminology is not used unnecessarily;
- [x] primary CTA is obvious;
- [ ] competing buttons do not create unnecessary ambiguity;
- [ ] copy is understandable to users, not only developers;
- [x] the user does not have to guess the next step.

# 3. NAVIGATION

Verify:

- [ ] logo → Home;
- [ ] all menu links work;
- [ ] current page can be identified where appropriate;
- [ ] browser Back works;
- [ ] browser Forward works;
- [ ] deep links work;
- [ ] refreshing nested routes does not 404;
- [ ] URL updates appropriately;
- [ ] meaningful state can be opened from a copied URL where expected;
- [ ] query parameters survive where appropriate;
- [ ] there are no navigation dead ends;
- [ ] mobile menu closes correctly;
- [ ] Escape closes dialogs/dropdowns where appropriate;
- [ ] click-outside behavior is sensible;
- [ ] anchors are not hidden behind sticky headers.

# 4. UI STATES

For every component that loads or manipulates data, verify relevant states:

- [ ] initial;
- [ ] loading;
- [ ] loaded;
- [ ] empty;
- [ ] partial;
- [ ] error;
- [ ] offline;
- [ ] retrying;
- [ ] permission denied;
- [ ] expired session.

Do not allow an empty page/table/dashboard to appear without guidance where an empty state would be useful.

# 5. LOADING UX

Verify:

- [ ] requests visibly show progress when appropriate;
- [ ] buttons display loading/progress;
- [ ] submit cannot be accidentally triggered twice;
- [ ] layout does not jump unnecessarily;
- [ ] skeletons resemble final layout if used;
- [ ] slow operations do not look frozen;
- [ ] large uploads show progress if practical;
- [ ] long-running jobs expose status;
- [ ] operation completion is clearly communicated.

# 6. ERROR HANDLING

Test and handle relevant responses including:

- [ ] 400;
- [ ] 401;
- [ ] 403;
- [ ] 404;
- [ ] 409;
- [ ] 413;
- [ ] 422;
- [ ] 429;
- [ ] 500;
- [ ] timeout;
- [ ] network disconnect;
- [ ] API outage.

Users should not see raw errors such as stack traces or framework/Axios messages.

Provide human-readable feedback.

Where appropriate:

- [ ] allow Retry;
- [ ] preserve form contents;
- [ ] do not unnecessarily destroy user work;
- [ ] send technical details to logs/error monitoring rather than exposing them.

# 7. FORMS

For every form verify:

- [ ] every field has an accessible label;
- [ ] placeholder is not the only label;
- [ ] required fields are clear;
- [ ] optional fields are clear where useful;
- [ ] validation is understandable;
- [ ] validation errors appear near the relevant field;
- [ ] focus behavior after validation is sensible;
- [ ] Enter works appropriately;
- [ ] Tab navigation works;
- [ ] browser autofill works where expected;
- [ ] password managers work;
- [ ] copy/paste is not unnecessarily blocked;
- [ ] accidental whitespace in emails/usernames is handled sensibly;
- [ ] email normalization is sensible;
- [ ] multiline input handles newlines;
- [ ] long text does not break layout;
- [ ] Unicode works;
- [ ] emoji works where allowed;
- [ ] `'`, `"`, `<`, `>`, `&` do not break rendering;
- [ ] very large numeric values are handled;
- [ ] negative numbers are handled;
- [ ] decimal input is handled correctly;
- [ ] max-length restrictions exist only where appropriate;
- [ ] users know relevant limits;
- [ ] leaving an important dirty form warns the user if losing work would be harmful.

# 8. BUTTONS AND CONTROLS

For each important button/control verify:

- [ ] normal state;
- [ ] hover state;
- [ ] keyboard focus state;
- [ ] active state;
- [ ] disabled state;
- [ ] loading state.

Also verify:

- [ ] semantic `<button>` is used for buttons;
- [ ] links are links;
- [ ] clickable `<div>` is not used unnecessarily;
- [ ] pointer/interaction feedback is sensible;
- [ ] submit buttons submit only the intended form;
- [ ] destructive actions are visually recognizable;
- [ ] irreversible actions require confirmation where appropriate;
- [ ] confirmation describes exactly what will happen.

# 9. DESTRUCTIVE ACTIONS

Test actions such as:

- [ ] delete account;
- [ ] delete project;
- [ ] remove member;
- [ ] reset data;
- [ ] disconnect integration.

Verify:

- [ ] confirmation exists where needed;
- [ ] double-triggering is prevented;
- [ ] backend authorization is enforced;
- [ ] repeated requests do not corrupt state;
- [ ] UI updates after deletion;
- [ ] browser Back does not misleadingly resurrect deleted content;
- [ ] deleted-object URLs behave sensibly;
- [ ] Undo/recovery exists where the product requires it.

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

- [ ] Tab order;
- [ ] Shift+Tab;
- [ ] visible focus;
- [ ] Enter;
- [ ] Space;
- [ ] Escape;
- [ ] modal focus trapping;
- [ ] focus does not escape behind modals;
- [ ] focus returns sensibly after closing dialogs;
- [ ] no keyboard traps.

# 24. ACCESSIBILITY

Check:

- [ ] semantic HTML;
- [ ] logical H1 usage;
- [ ] heading hierarchy;
- [ ] buttons use button semantics;
- [ ] links use link semantics;
- [ ] labels;
- [ ] alt text;
- [ ] keyboard use;
- [ ] visible focus;
- [ ] accessible names;
- [ ] ARIA only where needed;
- [ ] correct modal semantics;
- [ ] form errors accessible to assistive technologies;
- [ ] color is not the sole state indicator;
- [ ] reduced-motion preference;
- [ ] 200% zoom;
- [ ] text contrast roughly satisfies WCAG AA expectations;
- [ ] large-text/UI contrast is reasonable.

Do not degrade existing accessibility while making other fixes.

# 25. COPY AND PLACEHOLDERS

Search the repository and visible product for accidental leftovers such as:

- [ ] `Lorem`;
- [ ] `TODO`;
- [ ] `FIXME`;
- [ ] `test`;
- [ ] `dummy`;
- [ ] `example.com`;
- [ ] `John Doe`;
- [ ] `foo`;
- [ ] `bar`;
- [ ] `localhost`;
- [ ] `127.0.0.1`;
- [ ] staging URLs;
- [ ] temporary copy;
- [ ] obsolete “Coming soon” text.

Verify:

- [ ] consistent capitalization;
- [ ] consistent terminology;
- [ ] product name is consistent;
- [ ] sign-in/login terminology is consistent;
- [ ] error messages are user-facing;
- [ ] internal enum/debug values never appear to users.

# 26. LONG-CONTENT TORTURE TEST

Test relevant fields with:

- [ ] 100-character username/name;
- [ ] 200-character project/item name;
- [ ] very long email;
- [ ] very long URL;
- [ ] long unbroken string;
- [ ] emoji;
- [ ] Cyrillic;
- [ ] Chinese or another non-Latin script;
- [ ] empty string;
- [ ] very large text content.

Check:

- [ ] wrapping;
- [ ] overflow;
- [ ] truncation;
- [ ] layout stability;
- [ ] useful tooltip/full-view behavior for truncated content where appropriate.

# 27. DATES AND TIME

Verify:

- [ ] timezone strategy is defined;
- [ ] backend timestamps are consistent;
- [ ] users see appropriate local times;
- [ ] DST behavior;
- [ ] end of month;
- [ ] end of year;
- [ ] leap year;
- [ ] today/yesterday logic;
- [ ] timestamps around midnight;
- [ ] sorting is based on actual date/time, not formatted strings;
- [ ] serialization does not shift dates unexpectedly.

# 28. NUMBERS

Test:

- [ ] zero;
- [ ] negative values;
- [ ] very large values;
- [ ] very small values;
- [ ] decimal rounding;
- [ ] percentages;
- [ ] currencies;
- [ ] thousands/decimal separators;
- [ ] null;
- [ ] NaN;
- [ ] Infinity.

Never display things such as:

`NaN €`

or:

`undefined%`

# 29. LOCALIZATION / INTERNATIONALIZATION

Even if only one language currently exists:

- [ ] set appropriate `<html lang>`;
- [ ] format dates intentionally;
- [ ] format numbers intentionally;
- [ ] format currency correctly;
- [ ] pluralization is correct;
- [ ] avoid unnecessary hardcoding if internationalization is clearly planned;
- [ ] layout tolerates longer translated strings;
- [ ] emails use the intended language.

If multiple languages exist:

- [ ] test fallback behavior;
- [ ] language switching;
- [ ] URL strategy;
- [ ] hreflang where appropriate;
- [ ] untranslated translation keys never appear.

# 30. 404 HANDLING

Verify:

- [ ] unknown routes;
- [ ] malformed IDs;
- [ ] deleted objects;
- [ ] old routes.

The user should get:

- [ ] clear explanation;
- [ ] way back home/navigation;
- [ ] correct server status when applicable.

Do not return HTTP 200 for truly missing public SSR pages if correct 404 semantics are possible.

# 31. GLOBAL / 500 ERROR HANDLING

Verify:

- [ ] frontend Error Boundary or equivalent;
- [ ] backend global error handler;
- [ ] friendly error state;
- [ ] retry where appropriate;
- [ ] technical error is logged;
- [ ] stack traces/secrets are not exposed;
- [ ] request/event IDs are available if useful.

# 32. OFFLINE / BAD NETWORK

Test:

- [ ] Offline;
- [ ] slow connection;
- [ ] high latency;
- [ ] timeout;
- [ ] failed requests.

Verify:

- [ ] app does not appear frozen forever;
- [ ] sensible timeout behavior exists;
- [ ] user understands what happened;
- [ ] Retry exists where useful;
- [ ] failed optimistic updates roll back;
- [ ] unsaved work is preserved when practical.

# 33. BROWSER COMPATIBILITY

Test important functionality in:

- [ ] Chrome;
- [ ] Safari;
- [ ] Firefox;
- [ ] Edge;
- [ ] iOS Safari;
- [ ] Android Chrome.

Pay particular attention to Safari-specific issues.

# 34. PERFORMANCE

Review:

- [ ] initial JavaScript bundle size;
- [ ] unnecessary dependencies;
- [ ] code splitting;
- [ ] lazy loading;
- [ ] image optimization;
- [ ] font loading;
- [ ] unused fonts;
- [ ] N+1 backend/database requests;
- [ ] excessive requests on dashboards/pages;
- [ ] DB indexes;
- [ ] pagination;
- [ ] compression;
- [ ] static asset CDN if appropriate;
- [ ] cache headers;
- [ ] cache invalidation;
- [ ] third-party scripts;
- [ ] layout shifts.

Do not perform premature micro-optimization, but fix obvious production performance problems.

# 35. FONTS

Verify:

- [ ] font files exist in production;
- [ ] asset paths match case exactly;
- [ ] no 404s;
- [ ] sensible fallback;
- [ ] required Cyrillic/Unicode coverage exists;
- [ ] required font weights actually exist;
- [ ] browser does not need to synthesize inappropriate weights;
- [ ] text remains visible during loading.

# 36. SEO FOR PUBLIC PAGES

If pages should be indexed, verify:

- [ ] unique title;
- [ ] sensible meta description;
- [ ] meaningful H1;
- [ ] semantic headings;
- [ ] canonical URL;
- [ ] crawlable links;
- [ ] clean meaningful URLs;
- [ ] sitemap.xml;
- [ ] robots.txt;
- [ ] correct HTTP statuses;
- [ ] www/non-www policy;
- [ ] HTTP → HTTPS;
- [ ] trailing slash strategy;
- [ ] duplicate URL handling;
- [ ] no accidental `noindex`;
- [ ] preview/staging deployments are not indexed;
- [ ] structured data if the site actually benefits from it.

# 37. SOCIAL SHARING

Test a production URL preview in services such as:

- [ ] Telegram;
- [ ] Discord;
- [ ] Slack;
- [ ] iMessage/WhatsApp;
- [ ] LinkedIn.

Verify:

- [ ] Open Graph title;
- [ ] description;
- [ ] image;
- [ ] absolute image URL;
- [ ] correct favicon/site branding;
- [ ] no stale staging metadata;
- [ ] sensible image aspect ratio.

# 38. DOMAIN AND DNS

Verify:

- [ ] custom production domain;
- [ ] DNS;
- [ ] `www` behavior;
- [ ] bare/root domain behavior;
- [ ] one canonical host;
- [ ] redirect from alternate host;
- [ ] old domains redirect or are intentionally disabled;
- [ ] preview deployments are not unintentionally indexed;
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

- [ ] frontend API URL;
- [ ] backend URL;
- [ ] DB URL;
- [ ] storage configuration;
- [ ] email provider;
- [ ] OAuth credentials;
- [ ] OAuth redirects;
- [ ] payment keys;
- [ ] analytics;
- [ ] error monitoring;
- [ ] webhook secrets;
- [ ] cron secrets;
- [ ] feature flags;
- [ ] app origin/base URL;
- [ ] cookie config.

Verify:

- [ ] production does not silently assume a developer's local `.env`;
- [ ] secrets do not enter client bundles;
- [ ] build-time and runtime variables are understood;
- [ ] fallback values never accidentally point to localhost/staging.

# 41. SECRETS

Search repository/current configuration/history where possible for:

- [ ] API keys;
- [ ] DB passwords;
- [ ] tokens;
- [ ] private keys;
- [ ] `.env`;
- [ ] OAuth secrets.

If a real secret has been committed, removing the visible line is not enough: flag that the secret should be rotated.

Never expose secrets in the final report.

# 42. DATABASE

Before launch verify:

- [ ] backups;
- [ ] migrations;
- [ ] migrations tested against realistic existing data;
- [ ] deployment compatibility;
- [ ] indexes;
- [ ] constraints;
- [ ] unique constraints;
- [ ] foreign keys;
- [ ] nullable fields;
- [ ] defaults;
- [ ] transactions;
- [ ] rollback/migration strategy.

Test:

- [ ] existing users survive schema changes;
- [ ] old rows missing new fields;
- [ ] large-table migrations;
- [ ] deployment/migration order.

# 43. DATA INTEGRITY

Verify behavior for:

- [ ] duplicate submit;
- [ ] duplicate webhook;
- [ ] concurrent edits;
- [ ] race conditions;
- [ ] optimistic UI conflicts;
- [ ] parent/child deletion;
- [ ] orphan prevention;
- [ ] repeated API calls;
- [ ] relevant idempotency.

# 44. BACKUPS

Verify:

- [ ] backups actually exist;
- [ ] backups run automatically if expected;
- [ ] retention is defined;
- [ ] backups are not only on the same failing machine;
- [ ] restore procedure is known;
- [ ] restore has been tested if possible.

# 45. EMAILS

If any emails exist, test all relevant types:

- [ ] registration;
- [ ] verification;
- [ ] password reset;
- [ ] notifications;
- [ ] invitations;
- [ ] receipts.

For each verify:

- [ ] production URLs;
- [ ] From name;
- [ ] From address;
- [ ] Reply-To where appropriate;
- [ ] subject;
- [ ] plain-text fallback where relevant;
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

- [ ] creation;
- [ ] unread count;
- [ ] read/unread;
- [ ] click destination;
- [ ] target object deleted;
- [ ] user no longer has access;
- [ ] duplicate prevention;
- [ ] timestamp formatting;
- [ ] Mark All Read.

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

- [ ] Content-Security-Policy;
- [ ] HSTS;
- [ ] `X-Content-Type-Options`;
- [ ] frame/clickjacking protection;
- [ ] Referrer-Policy;
- [ ] Permissions-Policy.

Do not blindly paste a restrictive policy that breaks real app resources. Verify the resulting app works.

# 51. COOKIES

Verify session/security cookies:

- [ ] `Secure`;
- [ ] `HttpOnly` where appropriate;
- [ ] correct `SameSite`;
- [ ] correct expiry;
- [ ] logout invalidation;
- [ ] correct production domain/path;
- [ ] frontend JS cannot access sensitive cookies unnecessarily.

# 52. BASIC SECURITY ABUSE TESTS

Test inputs such as:

- [ ] HTML;
- [ ] `<script>`;
- [ ] SQL-looking strings;
- [ ] URL injection;
- [ ] path traversal strings;
- [ ] huge payloads;
- [ ] rapid repeated requests;
- [ ] brute-force-like login attempts;
- [ ] malicious filenames;
- [ ] malformed JSON;
- [ ] unexpected enum values;
- [ ] negative IDs;
- [ ] another user's UUID/ID.

Verify input validation, output escaping, access control, and rate limiting.

# 53. RATE LIMITING

Protect relevant endpoints such as:

- [ ] login;
- [ ] signup;
- [ ] password reset;
- [ ] email sending;
- [ ] expensive AI endpoints;
- [ ] uploads;
- [ ] search;
- [ ] public APIs.

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
- [ ] data collection;
- [ ] account deletion;
- [ ] data export if supported/required;
- [ ] analytics data;
- [ ] passwords are never logged;
- [ ] tokens are never logged;
- [ ] sensitive information is not unnecessarily put into query params;
- [ ] third-party processors/services are accounted for.

# 56. ACCOUNT SETTINGS

Test:

- [ ] change name;
- [ ] change email;
- [ ] email reverification;
- [ ] change password;
- [ ] forgotten-current-password path;
- [ ] logout;
- [ ] logout-all-devices if supported;
- [ ] delete account;
- [ ] delete confirmation;
- [ ] actual deletion/anonymization behavior;
- [ ] avatar upload/delete;
- [ ] timezone/preferences persistence.

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

- [ ] localStorage/sessionStorage schema changes;
- [ ] stale data from older app versions;
- [ ] corrupted JSON/data;
- [ ] incognito/private browsing where relevant;
- [ ] unavailable storage;
- [ ] logout clears sensitive local state;
- [ ] user A's local data does not appear for user B on the same device.

# 59. CACHE

Verify:

- [ ] HTML is not accidentally cached forever;
- [ ] hashed assets may be cached aggressively;
- [ ] old JS/new HTML incompatibility is prevented;
- [ ] service worker does not pin obsolete builds;
- [ ] CDN invalidation/update strategy works;
- [ ] private API responses are not publicly cached;
- [ ] logout does not leave unsafe cached private pages/data.

# 60. SERVICE WORKER / PWA

If a service worker/PWA exists, verify:

- [ ] update strategy;
- [ ] stale tabs;
- [ ] stale cache;
- [ ] offline behavior;
- [ ] manifest;
- [ ] icons;
- [ ] install flow;
- [ ] new releases reach users.

If a PWA is not required, ensure a leftover service worker/template does not interfere with deployments.

# 61. ANALYTICS

If analytics is used, verify:

- [ ] production property/project;
- [ ] staging/local development does not pollute production metrics;
- [ ] page views;
- [ ] signup;
- [ ] login;
- [ ] primary CTA;
- [ ] main success event;
- [ ] conversions;
- [ ] payment success if applicable;
- [ ] useful funnel events.

Never send sensitive content such as:

- [ ] passwords;
- [ ] tokens;
- [ ] private messages;
- [ ] sensitive form values.

# 62. PRODUCT METRICS

Ensure the product can measure the important funnel where relevant:

visitor → signup → activation → core action → return

The data should allow the team to understand:

- [ ] how many users arrived;
- [ ] how many registered;
- [ ] how many actually used the core feature;
- [ ] where users drop off.

# 63. ERROR TRACKING

Verify a production error-monitoring system if one is expected:

- [ ] production environment;
- [ ] release/version tagging;
- [ ] source maps configured appropriately;
- [ ] PII filtering;
- [ ] frontend errors;
- [ ] backend errors;
- [ ] unhandled promises;
- [ ] API failures.

# 64. LOGGING

Logs should contain enough information to debug incidents, such as:

- [ ] timestamp;
- [ ] severity;
- [ ] action/route;
- [ ] request ID/correlation ID where useful;
- [ ] error information;
- [ ] useful non-sensitive context.

Never log:

- [ ] passwords;
- [ ] auth tokens;
- [ ] API secrets;
- [ ] private keys;
- [ ] payment-card data;
- [ ] unnecessarily large sensitive request bodies.

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

- [ ] process alive;
- [ ] application ready;
- [ ] DB reachable;
- [ ] required dependencies available.

Health output must not leak secrets/configuration.

# 68. CRON / SCHEDULED JOBS

If scheduled jobs exist, verify:

- [ ] the scheduler is actually configured in production;
- [ ] timezone;
- [ ] retry behavior;
- [ ] duplicate execution;
- [ ] overlapping execution;
- [ ] logging;
- [ ] failure alerting;
- [ ] idempotency.

Do not assume that writing cron-job code means the job is actually scheduled.

# 69. QUEUES / WORKERS

If background queues/workers exist, verify:

- [ ] worker is actually running;
- [ ] correct production queue;
- [ ] retry policy;
- [ ] failed/dead-letter handling;
- [ ] persistence across restart where appropriate;
- [ ] duplicate-job safety;
- [ ] visibility/lock timeout behavior;
- [ ] failures are observable.

# 70. PRODUCTION BUILD

Do not rely only on development mode.

Run the actual production-equivalent commands, for example:

`npm run build`
`npm run start`

or the framework equivalent.

Verify:

- [ ] build completes;
- [ ] production environment variables are used;
- [ ] production/minified build works;
- [ ] dynamic imports work;
- [ ] SSR works if used;
- [ ] static generation works if used;
- [ ] routes work;
- [ ] assets load;
- [ ] source maps are intentionally configured;
- [ ] browser console is clean.

# 71. DEPENDENCIES

Verify:

- [ ] lockfile is committed;
- [ ] clean install succeeds;
- [ ] clean build succeeds;
- [ ] application does not rely on globally installed developer packages;
- [ ] runtime version is pinned/documented;
- [ ] Node/Python/etc. versions match production;
- [ ] native packages work on production architecture.

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

- [ ] signup;
- [ ] login;
- [ ] authorization;
- [ ] core action;
- [ ] saving;
- [ ] payments;
- [ ] account deletion;
- [ ] critical API endpoints;
- [ ] important calculations/business logic.

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

- [ ] errors;
- [ ] hydration issues;
- [ ] missing keys;
- [ ] CSP violations;
- [ ] failed assets;
- [ ] deprecated critical APIs;
- [ ] mixed content.

There should be zero unexplained production console errors.

# 76. NETWORK PANEL

Inspect actual production network traffic.

Look for:

- [ ] 404 assets;
- [ ] 401s;
- [ ] 500s;
- [ ] redirect loops;
- [ ] localhost requests;
- [ ] staging requests;
- [ ] duplicate requests;
- [ ] unnecessarily huge responses;
- [ ] tokens/secrets in URLs;
- [ ] sensitive information unnecessarily exposed in responses.

# 77. HTTP STATUS CODES

Verify appropriate behavior such as:

- [ ] `/` → 200;
- [ ] valid page → 200;
- [ ] missing page → 404;
- [ ] permanent move → 301/308 as appropriate;
- [ ] unauthenticated API → 401;
- [ ] forbidden → 403.

Do not let a SPA visually display 404 while the server incorrectly returns 200 for public pages if correct status handling is possible.

# 78. REDIRECTS

Verify:

- [ ] HTTP → HTTPS;
- [ ] www ↔ non-www;
- [ ] old URLs;
- [ ] renamed routes;
- [ ] login redirect;
- [ ] logout redirect;
- [ ] no redirect loops;
- [ ] relevant query parameters survive;
- [ ] permanent redirects use appropriate permanent status.

# 79. STATIC ASSETS

Verify production access to:

- [ ] logo;
- [ ] favicon;
- [ ] icons;
- [ ] fonts;
- [ ] images;
- [ ] manifest;
- [ ] downloads/static documents.

Check case-sensitive paths carefully.

Example:

`Logo.png`

is not the same as:

`logo.png`

on many production systems.

# 80. PUBLIC FILE EXPOSURE

Verify sensitive files are not publicly downloadable, including things like:

- [ ] `.env`;
- [ ] `.git`;
- [ ] SQLite/database files;
- [ ] backups;
- [ ] SQL dumps;
- [ ] internal configuration;
- [ ] private keys;
- [ ] logs.

# 81. SOURCE MAPS

Make an explicit decision about source maps:

- [x] public or private;
- [x] uploaded to monitoring provider;
- [x] whether they expose source code/internal details;
- [x] whether they are required for debugging.

Do not leave this accidental.

# 82. API READINESS

For every important API endpoint verify relevant:

- [ ] input validation;
- [ ] authentication;
- [ ] authorization;
- [ ] rate limiting;
- [ ] understandable error responses;
- [ ] stable response schema;
- [ ] timeout;
- [ ] pagination;
- [ ] request-size limits;
- [ ] logging;
- [ ] secrets not exposed;
- [ ] idempotency where required.

# 83. CORS

Verify:

- [ ] production frontend origin is allowed;
- [ ] staging is handled intentionally;
- [ ] localhost is not unnecessarily allowed in production;
- [ ] wildcard origin is not incorrectly combined with credentials;
- [ ] cookies/credentials actually work;
- [ ] preflight requests work.

# 84. FEATURE FLAGS

Verify:

- [ ] unfinished features are disabled;
- [ ] experimental UI does not accidentally appear;
- [ ] production defaults are correct;
- [ ] missing remote flags have safe fallback;
- [ ] admin/debug behavior cannot be enabled by arbitrary users through query params/client state.

# 85. DEBUG ARTIFACTS

Search for and review:

- [ ] `console.log`;
- [ ] `alert(`;
- [ ] `debugger`;
- [ ] `TODO`;
- [ ] `FIXME`;
- [ ] `DEV`;
- [ ] `MOCK`;
- [ ] `localhost`;
- [ ] fake emails;
- [ ] hardcoded test credentials.

Also inspect for:

- [ ] debug panels;
- [ ] admin shortcuts;
- [ ] fake-auth modes;
- [ ] payment bypasses;
- [ ] seed buttons;
- [ ] hidden development routes.

Remove anything inappropriate for production.

# 86. TEST / DEMO ACCOUNTS

Verify:

- [ ] test users do not have inappropriate production permissions;
- [ ] demo data is clearly intentional;
- [ ] staging data is not accidentally mixed with production;
- [ ] test payments do not pollute live payment systems.

# 87. ADMIN PANEL

If an admin interface exists:

- [ ] do not rely on obscurity;
- [ ] authenticate;
- [ ] authorize;
- [ ] log important admin actions where appropriate;
- [ ] confirm destructive actions;
- [ ] support safe pagination/search;
- [ ] prevent accidental mass production-data destruction.

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

- [ ] Privacy;
- [ ] Terms;
- [ ] Cookies;
- [ ] Contact;
- [ ] legal/company identity;
- [ ] correct copyright year.

Do not leave outdated years or template company information.

# 90. FOOTER

Check:

- [ ] links work;
- [ ] Privacy;
- [ ] Terms;
- [ ] Contact;
- [ ] social links;
- [ ] copyright;
- [ ] current year;
- [ ] logo/branding;
- [ ] no links pointing only to `#` unintentionally.

# 91. PAGE METADATA

Inspect rendered production source/head for expected tags such as:

- [ ] `<title>`;
- [ ] meta description;
- [ ] Open Graph title;
- [ ] Open Graph description;
- [ ] Open Graph image;
- [ ] Open Graph URL;
- [ ] canonical;
- [ ] favicon.

# 92. FAVICON SET

Verify relevant assets such as:

- [ ] favicon.ico;
- [ ] browser favicon;
- [ ] Apple touch icon;
- [ ] PWA icons if applicable;
- [ ] visibility on both light/dark browser chrome.

# 93. SCROLL BEHAVIOR

Verify:

- [ ] route changes scroll sensibly;
- [ ] Back restores scroll where expected;
- [ ] closing modal restores `body` scrolling;
- [ ] no accidental horizontal scroll;
- [ ] sticky UI does not hide important content.

# 94. MODALS

Test:

- [ ] close X;
- [ ] Cancel;
- [ ] Escape;
- [ ] backdrop click if intentionally supported;
- [ ] focus trap;
- [ ] body scroll lock;
- [ ] mobile;
- [ ] long modal content;
- [ ] destructive-action clarity.

# 95. DROPDOWNS / POPOVERS

Test:

- [ ] open;
- [ ] close;
- [ ] keyboard;
- [ ] mobile;
- [ ] clipping by parent overflow;
- [ ] screen-edge positioning;
- [ ] z-index;
- [ ] behavior while page scrolls.

# 96. Z-INDEX / OVERLAY STACK

Test combinations of:

- [ ] sticky headers;
- [ ] dropdowns;
- [ ] modals;
- [ ] toasts;
- [ ] tooltips;
- [ ] date pickers.

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

- [ ] Save;
- [ ] Upload;
- [ ] Submit;
- [ ] Delete;
- [ ] Invite;
- [ ] Payment;

the user must clearly know whether the action succeeded, failed, or is still running.

# 99. REFRESH TEST

Press Refresh/Cmd+R/Ctrl+R on every important route/state, especially:

- [ ] dashboard;
- [ ] editor;
- [ ] checkout success;
- [ ] OAuth callback;
- [ ] password-reset page;
- [ ] nested SPA routes;
- [ ] shared links.

# 100. OPEN-IN-NEW-TAB TEST

Open important links/routes directly in a new tab.

Verify:

- [ ] route works independently;
- [ ] required data loads from the server;
- [ ] page does not depend on hidden in-memory state from a previous route.

# 101. MULTIPLE TABS

Test:

- [ ] login/logout behavior across tabs;
- [ ] stale data;
- [ ] token refresh;
- [ ] concurrent edits;
- [ ] same action submitted from multiple tabs.

# 102. SESSION EXPIRATION

Simulate an expired session while the app is open.

Verify:

- [ ] app does not produce a flood of repeated failures;
- [ ] user understands they need to log in again;
- [ ] redirect works;
- [ ] unsaved state is preserved where practical;
- [ ] successful re-login returns them to the appropriate place.

# 103. VERSION / DEPLOYMENT COMPATIBILITY

Remember that during rollout users may temporarily have:

- [ ] old frontend + new backend;
- [ ] new frontend + old backend.

Avoid incompatible migrations/API changes during rollout where possible.

# 104. ROLLBACK

Before declaring production ready, determine:

- [ ] previous deployment can be restored;
- [ ] rollback process/command is known;
- [ ] database migration is reversible or backward compatible;
- [ ] previous config remains available;
- [ ] risky features can be disabled quickly where feature flags exist.

# 105. FINAL EXECUTION SEQUENCE

Do not merely read this list.

Actually perform as much of the following sequence as the environment permits:

- [ ] 1. perform clean dependency installation;
- [ ] 2. run lint;
- [ ] 3. run typecheck;
- [ ] 4. run tests;
- [ ] 5. run the production build;
- [ ] 6. run production build locally if possible;
- [ ] 7. test all major routes;
- [ ] 8. search repository for localhost/TODO/FIXME/mocks/test credentials/secrets/debugging leftovers;
- [ ] 9. inspect configuration and environment assumptions;
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
