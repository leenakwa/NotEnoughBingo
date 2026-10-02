"use client";

import { useEffect } from "react";

export function useUnsavedChangesWarning(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function protectNavigation(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      )
        return;
      if (anchor.dataset.authDialog === "true") return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.href === window.location.href) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      )
        return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", protectNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", protectNavigation, true);
    };
  }, [dirty, message]);
}
