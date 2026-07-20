# Security and media handling

## Security posture

Security is enforced at the API, service, database, storage, and deployment
layers. The frontend may hide unavailable actions for usability but is never an
authorization boundary.

The baseline follows OWASP guidance for authentication, session management,
access control, input validation, file upload, logging, and secure deployment.
Security-sensitive behavior must have executable tests.

## Authentication and sessions

- Use Django's server-side sessions with an opaque session cookie.
- Session cookie is `HttpOnly`, `Secure` in production, and `SameSite=Lax`
  unless a documented flow requires a stricter/different value.
- Rotate the session identifier on login, password/security changes, and
  privilege changes.
- Logout and session revocation invalidate server state.
- CSRF tokens protect every unsafe browser request.
- Authentication tokens are never stored in `localStorage` or readable
  JavaScript cookies.
- Passwords use Argon2id through Django's hasher interface, with parameters
  reviewed as hardware changes.
- Password policy favors length and breached-password detection over arbitrary
  composition rules.
- Email verification and reset tokens are random, single-use, short-lived, and
  stored only as digests.
- Critical account changes generate security email.

Login, registration, resend, and reset endpoints combine per-IP, per-account
digest, and broader anomaly throttles. Responses and timing avoid confirming
whether an email exists. Repeated failures can add progressive delay/challenge
without permanently locking an account for an attacker.

## Authorization and object visibility

Every object query begins from a permission-scoped queryset:

- `public`: catalog/search/profile/direct-link eligible;
- `unlisted`: direct-link eligible, excluded from catalogs and recommendations;
- `private`: owner only;
- hidden/deleted/suspended content: excluded unless an audited moderation
  context permits it.

Shared result access is evaluated independently and can never be more
permissive than the revision/source policy allowed at creation. Private-derived
results are owner-only. Random IDs reduce guessing but do not replace
authorization.

Tests cover cross-user read/update/delete attempts, route identifier mismatch,
archived/hidden objects, privacy-field combinations, old revisions, and every
public/unlisted/private path.

## Input and output safety

- DRF serializers validate type, length, enum, relationship ownership, and
  cross-field invariants.
- ORM parameterization is mandatory; raw SQL requires review and parameters.
- Cell/comment/profile text is plain text.
- Rich HTML is not accepted for bingo cell content.
- React's normal text escaping is retained; no `dangerouslySetInnerHTML` for
  user content.
- URLs and color/style values use strict allowlists.
- Search and event properties have length/depth/key limits.
- API errors do not expose stack traces, SQL, storage keys, or private object
  existence.

## Browser and transport security

Production requires:

- HTTPS at every public edge;
- HSTS after HTTPS is verified;
- `X-Content-Type-Options: nosniff`;
- a restrictive `Referrer-Policy`;
- `frame-ancestors 'none'` or an explicit embedding policy;
- a nonce/hash-based Content Security Policy compatible with Next.js;
- a minimal `Permissions-Policy`;
- no mixed content;
- explicit trusted hosts/origins;
- CORS disabled for arbitrary origins;
- proxy-aware scheme/host handling only from trusted proxies.

`TRUSTED_PROXY_HOPS` is not a generic “enable proxy headers” switch. It must
equal the number of controlled proxies on the request path so the application
selects the client address from the trusted right-hand side of
`X-Forwarded-For`. The production settings assume at least one isolated
ingress; local Compose uses one Nginx hop. A production load balancer plus
ingress commonly requires two, after the chain is verified. Backend ports must
not be reachable around that trusted ingress.

Staff administration is a higher-value authentication surface. The edge
rate-limits the exact Django Admin login path and returns `429` when exhausted.
Production should additionally restrict staff access by network/device policy
and place Admin behind organization SSO with phishing-resistant MFA when the
deployment platform supports it. This is an operator control, not a promise
that OAuth is implemented for product users.

Third-party scripts, fonts, and icon CDNs should be avoided. When unavoidable,
pin versions, use integrity metadata, include them in CSP, document the license,
and monitor advisories.

## Rate limiting and abuse prevention

DRF throttles are backed by Redis but critical uniqueness/quotas are enforced in
PostgreSQL as well. Limits cover:

- login, registration, reset, and verification;
- comments/replies and edits;
- likes/follows;
- reports;
- upload intents/finalize;
- shared result/export/account-export creation;
- search and event ingestion.

Guest identifiers are privacy-preserving and cannot be trusted as sole abuse
identity. Controls combine session, IP prefix, target, account age, verified
email, and velocity. Moderation actions and security events are auditable.

## Secrets and dependencies

- Secrets come from the deployment secret manager.
- `.env` is local-only and ignored.
- CI scans commits/images/dependencies for secrets and known vulnerabilities.
- Images and dependencies are pinned and updated deliberately.
- Production images run as non-root, have minimal packages, and use read-only
  filesystems where practical.
- Generate an SBOM and preserve license notices for releases.
- Logs and error tracking redact cookies, tokens, authorization, signed URLs,
  passwords, email bodies, and private documents.

## Media threat model

Threats include forged MIME/extensions, SVG script, parser exploits,
decompression bombs, oversized dimensions, polyglot files, metadata leakage,
malware, storage-key traversal, quota exhaustion, signed-URL replay, orphan
growth, and cross-user reference attacks.

`accept="image/*"` is only a picker hint and has no security value.

## Accepted media defaults

Initial user images are raster only:

- JPEG;
- PNG;
- WebP;
- AVIF when the deployed decoder is patched and enabled.

SVG, HTML, PDF-as-image, TIFF, PSD, executable formats, and arbitrary animated
formats are rejected in the first release. Exports may produce PDF but users do
not upload PDF content.

Configurable initial limits:

| Purpose | Maximum bytes | Additional rules |
| --- | ---: | --- |
| Avatar | 5 MiB | square derivative, safe dimension cap |
| Cover | 8 MiB | thumbnail derivatives |
| Cell image | 5 MiB | at most one per cell |
| Board background | 12 MiB | safe dimension/pixel cap |
| Bingo total | 102 image references | 100 cells + cover + background |

Decoder pixel limits protect against decompression bombs. Limits are enforced
before signing where possible, in object-storage policy, and again after
upload.

## Upload lifecycle

### 1. Create intent

The client sends purpose, filename for display only, byte length, declared MIME,
and owning draft/profile. The backend verifies:

- authenticated and email-verified actor where required;
- ownership and object state;
- purpose-specific size/count quota;
- allowed declared type/extension;
- rate limit.

Backend creates `MediaAsset(state=pending)` with a random key and returns a
short-lived presigned POST to that one `staging/uploads/…` key. POST policy
constrains bucket/key, size range, and content type. Browser capabilities never
permit writes to final `media/` or `exports/` prefixes. The bucket is private.

Local containers use an internal storage endpoint (`http://minio:9000`) while
the browser needs a public endpoint (`http://localhost:9000`). The backend must
sign/return the configured public endpoint without exposing storage
credentials; production normally uses one public CDN/storage hostname and a
private control-plane endpoint.

### 2. Upload

The browser uploads directly to object storage. Credentials are scoped to that
single key/policy and never expose general S3 credentials.

### 3. Finalize and quarantine

Finalize is idempotent and verifies the object exists at the exact key with the
expected length. The asset moves to `uploaded/scanning`, not `ready`. Drafts may
show a local preview but cannot publish the asset yet.

### 4. Inspect and normalize

A bounded Celery task:

- streams the object without loading unbounded data;
- checks magic bytes and detected MIME;
- decodes with a patched library under pixel/time/memory limits;
- rejects malformed/multi-payload content;
- strips metadata and color-profile surprises as policy requires;
- normalizes orientation;
- re-encodes to safe output formats;
- creates deterministic thumbnails;
- records checksum/dimensions/type;
- optionally invokes malware scanning;
- marks the asset ready or rejected/quarantined.

The worker writes verified, re-encoded bytes to an immutable
`media/…/{sha256}` key and removes the staging object. The worker/service
identity may write final media; a browser presign may not. A bucket lifecycle
rule is a defense-in-depth backstop that purges all versions and delete markers
under `staging/uploads/` after two days. Application cleanup runs sooner and
remains authoritative. Public rendering uses normalized derivatives.

### 5. Attach

Draft update validates that every asset is ready, owned by the author, and
allowed for its purpose. Supplying another user's public asset ID is rejected.
Publish repeats this validation transactionally.

## Serving media

- Original uploads and exports are private.
- Public content may use CDN-cached normalized derivatives under non-guessing
  immutable keys.
- Private/unlisted access uses short-lived signed URLs or an authorized delivery
  endpoint.
- Response types and `Content-Disposition` are explicit.
- `nosniff` is enabled.
- Signed URLs are not logged and have short TTLs.
- Deleting/hiding content triggers CDN invalidation where required.

## Orphans, deletion, and retention

- Pending/unattached uploads expire after 24 hours by default.
- Object storage purges every version under `staging/uploads/` after two days
  so abandoned or already-deleted staging data cannot live forever in a
  versioned bucket.
- Cleanup rechecks database references immediately before object deletion.
- Asset rows use states/tombstones so retrying deletion is safe.
- Shared revision references retain required derivatives.
- Account deletion schedules reference-aware cleanup after legal/security
  retention.
- Reconciliation jobs compare storage inventory with asset rows and alert
  before destructive cleanup.

## PNG and PDF exports

Exports are Celery jobs:

1. authorize requester and freeze exact revision/result input;
2. compute an idempotency hash;
3. render in an isolated, resource-bounded worker;
4. validate output;
5. store privately with expiry;
6. return a short-lived download URL.

Renderer inputs are structured data, not arbitrary HTML/URLs. Network access is
disabled or allowlisted. PDF metadata is sanitized. Job status exposes safe
errors and retries; generated files are removed by retention jobs.

## Privacy, export, and deletion

- Collect the minimum security metadata and document retention.
- User export runs asynchronously and is available only after recent
  authentication through a short-lived private URL.
- Deletion revokes sessions and new uploads immediately, then anonymizes or
  removes personal data after the grace period.
- Immutable moderation/security records retain only what policy/legal basis
  requires.
- Analytics guest identifiers and IP-derived data expire or are
  pseudonymized.

## Required security tests

- CSRF missing/invalid/rotated token;
- insecure cookie settings rejected in production checks;
- cross-user/private/unlisted object access;
- old revision/shared result authorization;
- auth enumeration and throttle behavior;
- password/verification/reset token replay and expiry;
- duplicate/concurrent likes and follows;
- comment depth/ownership/moderation;
- forged MIME/extension, oversized file, too many pixels, SVG/polyglot,
  corrupt image, quota, cross-owner asset ID;
- orphan cleanup with late attachment;
- log/error payload redaction;
- account export/deletion authorization and retention.
