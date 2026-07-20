import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="page-shell">
      <div className="page-state">
        <p className="eyebrow">404</p>
        <h1>Nothing on this square</h1>
        <p>The page may have moved, or the bingo is not available to you.</p>
        <Link href="/discover" className="button button--primary">
          Go to Discover
        </Link>
      </div>
    </main>
  );
}
