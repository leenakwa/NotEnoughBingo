"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { trackInteraction } from "@/lib/analytics";

// Record categories only. Query strings, recovery links, names and IDs never
// become analytics metadata, even when the page URL contains them.
function pageSurface(pathname: string): string | undefined {
  const pages: Record<string, string> = {
    "/discover": "discover",
    "/trending": "trending",
    "/explore": "explore",
    "/create": "create",
    "/register": "register",
    "/login": "login",
    "/profile": "profile",
    "/settings": "settings",
    "/notifications": "notifications",
  };
  if (pages[pathname]) return pages[pathname];
  if (pathname.startsWith("/bingo/")) return "direct";
  if (pathname.startsWith("/share/")) return "share";
  if (pathname.startsWith("/profile/")) return "profile";
  return undefined;
}

export function PageActivity() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const surface = pageSurface(pathname);
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      if (surface) trackInteraction("page_view", { metadata: { surface } });
    }
    if (!surface) return;
    const onClick = (event: MouseEvent) => {
      // Next Link prevents the native navigation and handles it client-side.
      // Our unsaved-change guards stop propagation when navigation is cancelled.
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin) return;
      const actions: Record<string, string> = {
        "/create": "create",
        "/register": "register",
        "/login": "login",
      };
      const action = actions[link.pathname];
      if (action) trackInteraction("cta", { metadata: { surface, action } });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname]);
  return null;
}
