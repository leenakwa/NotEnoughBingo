import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Not Enough Bingo handles account, content, media, and analytics data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Trust" title="Privacy Policy" updated="October 3, 2026">
      <p>
        This policy describes the data handled by Not Enough Bingo. The operator of a public
        deployment must identify its responsible maintainer and private contact channel on the
        <Link href="/support"> support page</Link>; this repository does not invent a company or
        legal entity.
      </p>

      <section>
        <h2>Information we handle</h2>
        <ul>
          <li>
            Account information such as email address, username, display name, password hash,
            email-verification state, and security/session records.
          </li>
          <li>
            Content you submit, including profiles, bingo drafts and published revisions, tags,
            comments, reports, play progress, shared-result snapshots, and uploaded media.
          </li>
          <li>
            Operational security data such as request identifiers, coarse IP/session hints, user
            agent summaries, timestamps, delivery outcomes, and redacted application logs.
          </li>
          <li>
            Browser failure diagnostics contain an error category, page category, optional HTTP
            status, and positions in loaded application scripts. Reports omit error messages, page
            URLs, query strings, form values, and bingo content. They help us diagnose broken
            interactions without collecting what you were writing.
          </li>
          <li>
            Product interactions such as page visits, primary navigation actions, board views,
            opens, starts, completions, shares, likes, and searches. Page visits record a page
            category, without URLs, query strings, names, or form values. A random browser
            identifier is stored locally for guests; the server stores only its one-way hash, not
            the raw identifier. Aggregate reports measure feature use and return visits.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>
          We use it to authenticate accounts, preserve drafts and progress, publish and share
          content, operate social and moderation features, rank public feeds, prevent abuse,
          diagnose failures, deliver security email, and honour export or deletion requests. We do
          not use browser identifiers as authentication credentials and do not sell personal data.
        </p>
      </section>

      <section id="cookies-and-browser-storage">
        <h2>Cookies and browser storage</h2>
        <p>
          We use first-party session and CSRF cookies to keep accounts signed in and protect forms.
          The session cookie is not readable by page scripts. A signed cookie lasting up to seven
          days helps other tabs clear temporary drafts after you log out. Your browser also stores
          guest bingo progress, play-mark preferences, temporary editor recovery data, and a random
          identifier for product interaction counts. Temporary recovery data may use session
          storage. Clearing browser data removes local progress and recovery data; signed-in
          progress saved on the server is managed through your account.
        </p>
        <p>
          Unsent comments, replies, comment edits, and reports are kept only in the current
          tab&apos;s memory for up to 24 hours, so it can be restored while you browse or sign back
          into the same account. It is tied to that account and the content you are commenting on or
          reporting, with at most 64 recent drafts retained. Sending, discarding or clearing the
          text, switching accounts, logging out, or closing the tab removes it. It is not written to
          browser storage or included in diagnostics.
        </p>
      </section>

      <section>
        <h2>Visibility and sharing</h2>
        <p>
          Public bingos and permitted profile fields can be seen by anyone. Unlisted bingos are
          available by direct link but excluded from discovery. Private bingos and their drafts are
          owner-only. A shared result is an immutable snapshot tied to the exact published revision
          used when it was created; private-derived results remain owner-only. Reports are visible
          only to authorized moderation staff.
        </p>
      </section>

      <section>
        <h2>Media and service providers</h2>
        <p>
          Uploads are quarantined, validated, metadata-stripped, and normalized before use. A
          deployment may rely on hosting, PostgreSQL, Redis, private object storage, transactional
          email, CDN/security ingress, backup, and error-monitoring providers. Those processors
          receive only the data needed to provide their service and must be configured by the
          deployment operator under appropriate terms.
        </p>
      </section>

      <section>
        <h2>Retention, export, and deletion</h2>
        <p>
          Active account and content data is kept while needed to provide the service. Raw
          interaction events are subject to the configured bounded analytics-retention job;
          aggregate metrics may be kept longer. Pending uploads, generated exports, sessions,
          idempotency records, and authentication tokens expire on their documented schedules.
          Backups expire under the operator&apos;s retention policy and deleted data is re-erased if
          a backup is restored.
        </p>
        <p>
          Account settings provide a downloadable export and a deletion request with a grace period.
          Deletion revokes sessions and removes or anonymizes personal fields while
          integrity-critical shared snapshots and moderation/security records are retained only as
          required for safety and consistency.
        </p>
      </section>

      <section>
        <h2>Your choices and contact</h2>
        <p>
          You can change profile privacy controls, remove content where available, revoke sessions,
          request an account export, or schedule account deletion. For access, correction, deletion,
          safety, or privacy questions, use the private contact configured on the
          <Link href="/support"> support and moderation page</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
