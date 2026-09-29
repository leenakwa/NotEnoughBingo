"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { BellIcon, PlusIcon, UserIcon } from "@/components/ui/icons";
import { api, isAuthenticationRequiredError } from "@/lib/api/client";
import { AUTH_CHANGED_EVENT, AUTH_REQUIRED_EVENT, AUTH_SYNC_KEY } from "@/lib/auth-events";
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
  unreadCount: number;
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

function AccountNavigation({ avatarUrl, pathname, unreadCount, user }: HeaderViewProps) {
  return (
    <div className="account-nav">
      {user ? (
        <Link
          className="icon-link"
          href="/notifications"
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
          aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
        >
          <BellIcon />
          {unreadCount ? (
            <span className="notification-badge" aria-hidden="true">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
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

export function ClassicAppHeader({ avatarUrl, pathname, unreadCount, user }: HeaderViewProps) {
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
        <AccountNavigation
          avatarUrl={avatarUrl}
          pathname={pathname}
          unreadCount={unreadCount}
          user={user}
        />
      </div>
    </header>
  );
}

export function ModernAppHeader({ avatarUrl, pathname, unreadCount, user }: HeaderViewProps) {
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

      <AccountNavigation
        avatarUrl={avatarUrl}
        pathname={pathname}
        unreadCount={unreadCount}
        user={user}
      />
    </header>
  );
}

export function AppHeader({ variant = "classic" }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const currentUserId = useRef<string | null | undefined>(undefined);
  const refreshVersion = useRef(0);
  const avatarUrl = user?.avatar?.thumbnail_url ?? user?.avatar?.url ?? undefined;

  const refreshUser = useCallback(
    (redirectIfChanged = false) => {
      const version = ++refreshVersion.current;
      const applyUser = (next: AuthenticatedUser | null) => {
        if (version !== refreshVersion.current) return;
        const previousId = currentUserId.current;
        const nextId = next?.id ?? null;
        currentUserId.current = nextId;
        setUser(next);
        if (redirectIfChanged && previousId !== undefined && previousId !== nextId) {
          const destination =
            nextId === null
              ? `/login?reason=session-expired&next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`
              : "/trending";
          router.replace(destination);
          router.refresh();
        }
      };
      api.auth
        .session()
        .then(applyUser)
        .catch((caught) => {
          if (isAuthenticationRequiredError(caught)) applyUser(null);
        });
    },
    [router],
  );

  useEffect(() => {
    refreshUser();
  }, [pathname, refreshUser]);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    api.notifications
      .unreadCount()
      .then(({ count }) => setUnreadCount(count))
      .catch(() => undefined);
  }, [pathname, user]);

  useEffect(() => {
    const handleCurrentTabChange = () => refreshUser();
    const handleFocus = () => refreshUser(true);
    const handleAuthenticationRequired = () => {
      if (currentUserId.current) refreshUser(true);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTH_SYNC_KEY) refreshUser(true);
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleCurrentTabChange);
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleCurrentTabChange);
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshUser]);

  const HeaderView = variant === "modern" ? ModernAppHeader : ClassicAppHeader;

  return (
    <HeaderView avatarUrl={avatarUrl} pathname={pathname} unreadCount={unreadCount} user={user} />
  );
}
