import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { defaultOpenGraph } from "@/lib/metadata";

export const metadata: Metadata = {
  title: "Support & Moderation",
  description: "Get product help or report a safety, privacy, or security concern.",
  alternates: { canonical: "/support" },
  openGraph: defaultOpenGraph("/support"),
};

function SupportContact() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (email) {
    return <a href={`mailto:${email}`}>{email}</a>;
  }
  return <a href="https://github.com/leenakwa/NotEnoughBingo/issues">the project issue tracker</a>;
}

export default function SupportPage() {
  return (
    <LegalPage eyebrow="Help" title="Support & Moderation" updated="August 7, 2026">
      <section>
        <h2>Product help</h2>
        <p>
          For reproducible bugs and general product questions, contact <SupportContact />. Include
          the page, what you expected, and what happened. Never post passwords, session cookies,
          verification/reset links, private bingo content, or signed download URLs publicly.
        </p>
      </section>
      <section>
        <h2>Content reports</h2>
        <p>
          When possible, use the Report action on the bingo, comment, or profile so moderators
          receive the correct target and context. For a report you cannot submit in-product, use the
          contact above and include only the minimum information needed to locate the content.
        </p>
      </section>
      <section>
        <h2>Privacy and security</h2>
        <p>
          Privacy requests should identify the account and requested action without sending identity
          documents unless the operator specifically explains why they are required. Security
          vulnerabilities should be reported privately to the configured support email. If no
          private email appears here, do not publish exploit details; ask the maintainer for a
          private channel through the issue tracker.
        </p>
      </section>
    </LegalPage>
  );
}
