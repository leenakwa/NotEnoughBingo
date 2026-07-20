import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: { text: string; href: string; label: string };
}) {
  return (
    <main id="main-content" className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        <p>{description}</p>
        {children}
        {footer ? (
          <p className="auth-footer">
            {footer.text} <Link href={footer.href}>{footer.label}</Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
