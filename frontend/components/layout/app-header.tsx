"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { BellIcon, PlusIcon, UserIcon } from "@/components/ui/icons";
import { api } from "@/lib/api/client";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-events";
import type { AuthenticatedUser } from "@/lib/api/types";

const navigation = [
  { href: "/discover", label: "Discover" },
  { href: "/trending", label: "Trending" },
  { href: "/explore", label: "Explore" },
];

export function AppHeader() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const avatarUrl = user?.avatar?.thumbnail_url ?? user?.avatar?.url ?? undefined;

  const refreshUser = useCallback(() => {
    api.auth
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    refreshUser();
  }, [pathname, refreshUser]);

  useEffect(() => {
    window.addEventListener(AUTH_CHANGED_EVENT, refreshUser);
    window.addEventListener("focus", refreshUser);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, refreshUser);
      window.removeEventListener("focus", refreshUser);
    };
  }, [refreshUser]);

  return (
    <header className="site-header">
      <Link className="brand-link" href="/discover" aria-label="Not Enough Bingo home">
        Not Enough Bingo
      </Link>

      <nav className="primary-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname.startsWith(item.href) ? "nav-link is-active" : "nav-link"}
            aria-current={pathname.startsWith(item.href) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/create"
          className={
            pathname.startsWith("/create")
              ? "nav-link create-link is-active"
              : "nav-link create-link"
          }
          aria-current={pathname.startsWith("/create") ? "page" : undefined}
        >
          <PlusIcon />
          <span>Create</span>
        </Link>
      </nav>

      <div className="account-nav">
        {user ? (
          <Link
            className="icon-link"
            href="/notifications"
            aria-label="Notifications"
            aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
          >
            <BellIcon />
          </Link>
        ) : null}
        <Link
          className="icon-link"
          href={user ? "/profile" : "/login"}
          aria-label={user ? `Profile for ${user.display_name}` : "Log in"}
          aria-current={pathname.startsWith("/profile") ? "page" : undefined}
        >
          {avatarUrl ? (
            // The API controls avatar URLs and supplies sanitized raster media.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" width={34} height={34} />
          ) : (
            <UserIcon />
          )}
        </Link>
      </div>
    </header>
  );
}
