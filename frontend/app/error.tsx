"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/page-state";
import { reportBrowserError } from "@/lib/browser-errors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportBrowserError(error, "boundary");
    console.error("Page error", { type: error.name, digest: error.digest });
  }, [error]);

  return (
    <main id="main-content" className="page-shell">
      <ErrorState message="This page could not be loaded. Please try again." onRetry={reset} />
    </main>
  );
}
