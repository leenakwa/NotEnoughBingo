"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
  useEffect(() => {
    console.error("Root page error", { type: error.name, digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          color: "#0a0a0a",
          background: "#ffffff",
          fontFamily: '"Courier New", Courier, monospace',
          lineHeight: 1.45,
        }}
      >
        <main id="main-content" style={{ width: "100%", maxWidth: 520 }}>
          <p style={{ fontWeight: 700 }}>Not Enough Bingo</p>
          <h1>This page could not be loaded</h1>
          <p>Please try again. You can also return to Discover.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
            <button
              type="button"
              onClick={retry ?? reset}
              style={{
                minHeight: 44,
                padding: "10px 18px",
                border: "2px solid #0a0a0a",
                color: "#ffffff",
                background: "#0a0a0a",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/discover"
              style={{
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 18px",
                border: "2px solid #0a0a0a",
                color: "#0a0a0a",
                textDecoration: "none",
              }}
            >
              Go to Discover
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
