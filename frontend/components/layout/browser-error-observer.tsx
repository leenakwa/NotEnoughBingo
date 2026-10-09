"use client";

import { useEffect } from "react";

import { reportBrowserError } from "@/lib/browser-errors";

export function BrowserErrorObserver() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportBrowserError(event.error, "exception");
    const onRejection = (event: PromiseRejectionEvent) =>
      reportBrowserError(event.reason, "rejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
