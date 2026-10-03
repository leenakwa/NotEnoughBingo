import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The basic terms for using Not Enough Bingo.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Trust" title="Terms of Service" updated="August 7, 2026">
      <p>
        These project terms are a practical first version for a public beta. A production operator
        must identify itself and the governing contact details before launch; the source repository
        does not claim a legal entity that has not been provided.
      </p>
      <section>
        <h2>Using the service</h2>
        <p>
          You may browse and play accessible bingos as a guest. Creating, publishing, commenting,
          following, reporting, and other account actions require an eligible account. Keep your
          credentials secure, provide accurate registration information, and do not use another
          person&apos;s account.
        </p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          You keep responsibility for content you submit and must have the rights needed to upload
          and share it. You grant the service permission to store, process, resize, display, and
          distribute that content only as needed to operate the product, including immutable
          published revisions and shared-result snapshots.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>
          Do not publish illegal, abusive, deceptive, privacy-invasive, infringing, malicious, or
          exploitative material; probe or bypass security controls; automate abusive traffic; or
          interfere with other users. The{" "}
          <Link href="/community-guidelines">community guidelines</Link>
          provide concrete examples.
        </p>
      </section>
      <section>
        <h2>Moderation and availability</h2>
        <p>
          The operator may hide content, restrict accounts, preserve evidence, or remove access when
          reasonably needed for safety, legal compliance, or service integrity. Beta features may
          change and availability is not guaranteed. We will avoid destructive changes to user work
          and will communicate material incidents when a reliable channel is available.
        </p>
      </section>
      <section>
        <h2>Ending use</h2>
        <p>
          You may stop using the service and request account deletion from settings. Some immutable
          snapshots, security records, and moderation evidence may be retained as explained in the
          <Link href="/privacy"> privacy policy</Link>. Contact the deployment operator through the
          <Link href="/support"> support page</Link> with questions.
        </p>
      </section>
    </LegalPage>
  );
}
