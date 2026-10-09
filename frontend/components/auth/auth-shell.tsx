import type { ReactNode } from "react";

import { AuthLink } from "@/components/auth/auth-link";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  presentation = "page",
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: { text: string; href: string; label: string };
  presentation?: "page" | "dialog";
}) {
  const Container = presentation === "dialog" ? "div" : "main";
  const Heading = presentation === "dialog" ? "h2" : "h1";
  const titleId = presentation === "dialog" ? "auth-dialog-title" : "auth-title";
  return (
    <Container
      id={presentation === "page" ? "main-content" : undefined}
      className={presentation === "dialog" ? "auth-dialog__content" : "auth-shell"}
    >
      <section
        className={presentation === "dialog" ? undefined : "auth-card"}
        aria-labelledby={titleId}
      >
        <p className="eyebrow">{eyebrow}</p>
        <Heading id={titleId}>{title}</Heading>
        <p>{description}</p>
        {children}
        {footer ? (
          <p className="auth-footer">
            {footer.text} <AuthLink href={footer.href}>{footer.label}</AuthLink>
          </p>
        ) : null}
      </section>
    </Container>
  );
}
