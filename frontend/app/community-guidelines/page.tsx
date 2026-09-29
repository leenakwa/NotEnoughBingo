import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: "Rules that keep Not Enough Bingo welcoming and safe.",
  alternates: { canonical: "/community-guidelines" },
};

export default function CommunityGuidelinesPage() {
  return (
    <LegalPage eyebrow="Community" title="Community Guidelines" updated="August 7, 2026">
      <p>
        Bingo can be playful, specific, and irreverent without targeting people or making the
        community unsafe. These rules apply to boards, profiles, comments, images, and shared
        results.
      </p>
      <section>
        <h2>Be welcome here</h2>
        <ul>
          <li>Critique ideas and experiences without harassment or targeted humiliation.</li>
          <li>Do not promote hatred, credible threats, stalking, or unwanted sexual content.</li>
          <li>Do not reveal private personal information or impersonate another person.</li>
          <li>
            Do not upload malware, deceptive links, spam, or content intended to evade controls.
          </li>
          <li>Respect copyright, privacy, and other rights in text and images you publish.</li>
        </ul>
      </section>
      <section>
        <h2>Age-sensitive and harmful content</h2>
        <p>
          Do not sexualize minors, encourage self-harm, facilitate dangerous wrongdoing, or use the
          product to exploit vulnerable people. Report urgent safety concerns through the contact
          path on the <Link href="/support">support page</Link>; contact local emergency services
          when someone faces immediate danger.
        </p>
      </section>
      <section>
        <h2>Reports and enforcement</h2>
        <p>
          Use the in-product Report action with useful context. Duplicate or retaliatory reports are
          abuse. Moderators may dismiss a report, hide or restore content, remove content, or
          suspend an account. Actions are recorded in an audit history and should be proportionate
          to context, severity, and repeated behavior.
        </p>
      </section>
    </LegalPage>
  );
}
