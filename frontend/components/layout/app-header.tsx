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

interface HeaderViewProps {
  avatarUrl?: string;
  pathname: string;
  user: AuthenticatedUser | null;
}

interface AppHeaderProps {
  variant?: "classic" | "modern";
}

function NavigationLinks({ pathname }: Pick<HeaderViewProps, "pathname">) {
  return navigation.map((item) => {
    const isActive = pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={isActive ? "nav-link is-active" : "nav-link"}
        aria-current={isActive ? "page" : undefined}
      >
        {item.label}
      </Link>
    );
  });
}

function AccountNavigation({ avatarUrl, pathname, user }: HeaderViewProps) {
  return (
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
  );
}

export function ClassicAppHeader({ avatarUrl, pathname, user }: HeaderViewProps) {
  const createIsActive = pathname.startsWith("/create");

  return (
    <header className="site-header site-header--classic">
      <div className="classic-header__left">
        <Link className="brand-link" href="/discover" aria-label="Not Enough Bingo home">
          Not-Enough-Bingo
        </Link>
      </div>

      <div className="classic-header__center">
        <Link
          href="/create"
          className={createIsActive ? "classic-header__create is-active" : "classic-header__create"}
          aria-label="Create"
          aria-current={createIsActive ? "page" : undefined}
        >
          <PlusIcon />
          <span className="sr-only">Create</span>
        </Link>
      </div>

      <div className="classic-header__right">
        <nav className="classic-header__nav" aria-label="Main navigation">
          <NavigationLinks pathname={pathname} />
        </nav>
        <AccountNavigation avatarUrl={avatarUrl} pathname={pathname} user={user} />
      </div>
    </header>
  );
}

export function ModernAppHeader({ avatarUrl, pathname, user }: HeaderViewProps) {
  const createIsActive = pathname.startsWith("/create");

  return (
    <header className="site-header site-header--modern">
      <Link className="brand-link" href="/discover" aria-label="Not Enough Bingo home">
        Not Enough Bingo
      </Link>

      <nav className="primary-nav" aria-label="Main navigation">
        <NavigationLinks pathname={pathname} />
        <Link
          href="/create"
          className={createIsActive ? "nav-link create-link is-active" : "nav-link create-link"}
          aria-current={createIsActive ? "page" : undefined}
        >
          <PlusIcon />
          <span>Create</span>
        </Link>
      </nav>

      <AccountNavigation avatarUrl={avatarUrl} pathname={pathname} user={user} />
    </header>
  );
}

export function AppHeader({ variant = "classic" }: AppHeaderProps) {
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

  const HeaderView = variant === "modern" ? ModernAppHeader : ClassicAppHeader;

  return <HeaderView avatarUrl={avatarUrl} pathname={pathname} user={user} />;
}
