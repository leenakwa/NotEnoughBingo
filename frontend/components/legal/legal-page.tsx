import type { ReactNode } from "react";

export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main id="main-content" className="page-shell legal-page">
      <header className="page-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>Last updated: {updated}</p>
      </header>
      <div className="legal-content">{children}</div>
    </main>
  );
}
