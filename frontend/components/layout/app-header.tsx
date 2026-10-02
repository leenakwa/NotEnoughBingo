"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { BellIcon, PlusIcon, UserIcon } from "@/components/ui/icons";
import { AvatarImage } from "@/components/ui/avatar-image";
import { AuthLink } from "@/components/auth/auth-link";
import { api, isAuthenticationRequiredError } from "@/lib/api/client";
import {
  AUTH_CHANGED_EVENT,
  AUTH_REQUIRED_EVENT,
  AUTH_SYNC_KEY,
  AUTH_SESSION_ENDED_EVENT,
  openAuthDialog,
} from "@/lib/auth-events";
import type { AuthenticatedUser } from "@/lib/api/types";

const navigation = [
  { href: "/discover", label: "Discover" },
  { href: "/trending", label: "Trending" },
  { href: "/explore", label: "Explore" },
];

interface HeaderViewProps {
  avatarUrl?: string;
  headerRef?: RefObject<HTMLElement | null>;
  hasScrolled?: boolean;
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
      <AuthLink
        className="icon-link"
        href={user ? "/profile" : "/login"}
        aria-label={user ? `Profile for ${user.display_name}` : "Log in"}
        aria-current={pathname.startsWith("/profile") ? "page" : undefined}
      >
        <AvatarImage src={avatarUrl} width={34} height={34} fallback={<UserIcon />} />
      </AuthLink>
    </div>
  );
}

export function ClassicAppHeader({
  avatarUrl,
  headerRef,
  hasScrolled = false,
  pathname,
  unreadCount,
  user,
}: HeaderViewProps) {
  const createIsActive = pathname.startsWith("/create");

  return (
    <header
      ref={headerRef}
      className={`site-header site-header--classic${hasScrolled ? " is-scrolled" : ""}`}
    >
      <div className="classic-header__left">
        <Link className="brand-link" href="/discover" aria-label="Not Enough Bingo home">
          Not Enough Bingo
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

export function ModernAppHeader({
  avatarUrl,
  headerRef,
  hasScrolled = false,
  pathname,
  unreadCount,
  user,
}: HeaderViewProps) {
  const createIsActive = pathname.startsWith("/create");

  return (
    <header
      ref={headerRef}
      className={`site-header site-header--modern${hasScrolled ? " is-scrolled" : ""}`}
    >
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
  const [hasScrolled, setHasScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const currentUserId = useRef<string | null | undefined>(undefined);
  const refreshVersion = useRef(0);
  const authenticationCheckInFlight = useRef(false);
  const avatarUrl = user?.avatar?.thumbnail_url ?? user?.avatar?.url ?? undefined;

  useEffect(() => {
    const header = headerRef.current;
    // Desktop WebKit shifts fixed layers during native rubber-banding.
    const correctRubberBand =
      /Macintosh/.test(navigator.userAgent) &&
      /AppleWebKit/.test(navigator.userAgent) &&
      !/Chrome|Chromium|Edg|OPR/.test(navigator.userAgent) &&
      !navigator.maxTouchPoints;
    let previous = false;
    let previousOffset = 0;
    const updateScroll = () => {
      const offset = correctRubberBand ? Math.min(0, window.scrollY) : 0;
      if (header && offset !== previousOffset) {
        previousOffset = offset;
        if (offset < 0) header.style.setProperty("--header-overscroll-top", `${offset}px`);
        else header.style.removeProperty("--header-overscroll-top");
      }
      const next = window.scrollY > 0;
      if (next !== previous) {
        previous = next;
        setHasScrolled(next);
      }
    };
    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateScroll);
      header?.style.removeProperty("--header-overscroll-top");
    };
  }, []);

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
          if (nextId === null) {
            window.dispatchEvent(new Event(AUTH_SESSION_ENDED_EVENT));
            openAuthDialog({ mode: "login", reason: "session-expired" });
          } else {
            router.replace("/trending");
            router.refresh();
          }
        }
      };
      return api.auth
        .session()
        .then(applyUser)
        .catch((caught) => {
          if (isAuthenticationRequiredError(caught)) applyUser(null);
        });
    },
    [router],
  );

  useEffect(() => {
    void refreshUser();
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
    const handleCurrentTabChange = () => void refreshUser();
    const handleFocus = () => void refreshUser(true);
    const handleAuthenticationRequired = () => {
      if (!currentUserId.current || authenticationCheckInFlight.current) return;
      authenticationCheckInFlight.current = true;
      void refreshUser(true).finally(() => {
        authenticationCheckInFlight.current = false;
      });
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTH_SYNC_KEY) void refreshUser(true);
    };
    let signOutChannel: BroadcastChannel | undefined;
    try {
      if (typeof window.BroadcastChannel !== "undefined") {
        signOutChannel = new window.BroadcastChannel(AUTH_SYNC_KEY);
        signOutChannel.addEventListener("message", (event) => {
          if (event.data === "signed-out") void refreshUser(true);
        });
      }
    } catch {
      // Storage events and focus revalidation remain available.
    }
    window.addEventListener(AUTH_CHANGED_EVENT, handleCurrentTabChange);
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);
    return () => {
      signOutChannel?.close();
      window.removeEventListener(AUTH_CHANGED_EVENT, handleCurrentTabChange);
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshUser]);

  const HeaderView = variant === "modern" ? ModernAppHeader : ClassicAppHeader;

  return (
    <HeaderView
      avatarUrl={avatarUrl}
      headerRef={headerRef}
      hasScrolled={hasScrolled}
      pathname={pathname}
      unreadCount={unreadCount}
      user={user}
    />
  );
}
