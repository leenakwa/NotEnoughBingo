import Link from "next/link";

const trustLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy#cookies-and-browser-storage", label: "Cookies" },
  { href: "/community-guidelines", label: "Community guidelines" },
  { href: "/support", label: "Contact & support" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        © {new Date().getUTCFullYear()} Not Enough Bingo · Create, play, and share community bingo
        boards.
      </p>
      <nav aria-label="Trust and legal">
        {trustLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
