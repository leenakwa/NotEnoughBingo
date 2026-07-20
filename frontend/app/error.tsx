"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/page-state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // This is the integration point for the configured error-tracking provider.
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="page-shell">
      <ErrorState message="This page could not be loaded. Please try again." onRetry={reset} />
    </main>
  );
}
