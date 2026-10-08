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
  AUTH_SESSION_OBSERVED_EVENT,
  AUTH_SIGNED_OUT_EVENT,
  getAuthSyncChannel,
  openAuthDialog,
  type AuthSessionObservation,
} from "@/lib/auth-events";
import type { AuthenticatedUser } from "@/lib/api/types";

const navigation = [
  { href: "/discover", label: "Discover" },
  { href: "/trending", label: "Trending" },
  { href: "/explore", label: "Explore" },
];

type HeaderUser = Pick<AuthenticatedUser, "id" | "display_name" | "avatar">;

interface HeaderViewProps {
  avatarUrl?: string;
  headerRef?: RefObject<HTMLElement | null>;
  hasScrolled?: boolean;
  pathname: string;
  user: HeaderUser | null;
  unreadCount: number;
}

interface AppHeaderProps {
  variant?: "classic" | "modern";
  initialUserId?: string | null;
  initialUser?: HeaderUser | null;
  initialLogoutEvent?: string | null;
}

function NavigationLinks({ pathname }: Pick<HeaderViewProps, "pathname">) {
  return navigation.map((item) => {
    const isActive = pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={pathname === item.href ? false : undefined}
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
          prefetch={pathname === "/notifications" ? false : undefined}
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
        <Link
          className="brand-link"
          href="/discover"
          prefetch={pathname === "/discover" ? false : undefined}
          aria-label="Not Enough Bingo home"
        >
          Not Enough Bingo
        </Link>
      </div>

      <div className="classic-header__center">
        <Link
          href="/create"
          prefetch={pathname === "/create" ? false : undefined}
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
      <Link
        className="brand-link"
        href="/discover"
        prefetch={pathname === "/discover" ? false : undefined}
        aria-label="Not Enough Bingo home"
      >
        Not Enough Bingo
      </Link>

      <nav className="primary-nav" aria-label="Main navigation">
        <NavigationLinks pathname={pathname} />
        <Link
          href="/create"
          prefetch={pathname === "/create" ? false : undefined}
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

export function AppHeader({
  variant = "classic",
  initialUserId,
  initialUser,
  initialLogoutEvent,
}: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<HeaderUser | null>(initialUser ?? null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadRefresh, setUnreadRefresh] = useState(0);
  const userId = user?.id ?? null;
  const unreadUserId = useRef(userId);
  const [hasScrolled, setHasScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const currentUserId = useRef<string | null | undefined>(
    initialUser === undefined ? initialUserId : (initialUser?.id ?? null),
  );
  const refreshVersion = useRef(0);
  const lastLogoutEvent = useRef<string | null | undefined>(initialLogoutEvent);
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
    (redirectIfChanged = false, refreshUnread = true) => {
      const version = ++refreshVersion.current;
      const applyUser = (next: AuthenticatedUser | null) => {
        if (version !== refreshVersion.current) return;
        const previousId = currentUserId.current;
        const nextId = next?.id ?? null;
        const accountChanged =
          previousId !== undefined &&
          previousId !== null &&
          nextId !== null &&
          previousId !== nextId;
        currentUserId.current = nextId;
        setUser(next);
        if (refreshUnread && nextId && previousId === nextId) {
          setUnreadRefresh((previous) => previous + 1);
        }
        if (
          accountChanged ||
          (nextId === null &&
            previousId !== null &&
            (previousId !== undefined || redirectIfChanged))
        ) {
          // Children can authenticate independently, including during server rendering.
          // A guest or changed account must invalidate their previous authenticated state.
          window.dispatchEvent(new Event(AUTH_SESSION_ENDED_EVENT));
        }
        if (
          (redirectIfChanged || accountChanged) &&
          previousId !== undefined &&
          previousId !== nextId
        ) {
          if (nextId === null) {
            openAuthDialog({ mode: "login", reason: "session-expired" });
          } else {
            router.replace("/trending");
            router.refresh();
          }
        }
      };
      return api.auth
        .session((event) => {
          if (version !== refreshVersion.current) return;
          const previous = lastLogoutEvent.current;
          lastLogoutEvent.current = event;
          if (previous !== undefined && event && previous !== event)
            window.dispatchEvent(new Event(AUTH_SIGNED_OUT_EVENT));
        })
        .then(applyUser)
        .catch((caught) => {
          if (isAuthenticationRequiredError(caught)) applyUser(null);
        });
    },
    [router],
  );

  useEffect(() => {
    // The pathname/account effect already refreshes counts during bootstrap and navigation.
    void refreshUser(false, false);
  }, [pathname, refreshUser]);

  useEffect(() => {
    let active = true;
    if (unreadUserId.current !== userId) {
      unreadUserId.current = userId;
      setUnreadCount(0);
    }
    if (!userId) {
      return;
    }
    api.notifications
      .unreadCount()
      .then(({ count }) => {
        if (active && currentUserId.current === userId) setUnreadCount(count);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname, userId, unreadRefresh]);

  useEffect(() => {
    const handleCurrentTabChange = () => void refreshUser();
    const handleFocus = () => void refreshUser(true);
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refreshUser(true);
    };
    const handleSessionObserved = (event: Event) => {
      if (currentUserId.current !== undefined || lastLogoutEvent.current !== undefined) return;
      const observed = (event as CustomEvent<AuthSessionObservation>).detail;
      currentUserId.current = observed.userId;
      lastLogoutEvent.current = observed.logoutEvent;
    };
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
    const signOutChannel = getAuthSyncChannel();
    const handleSignOutMessage = (event: MessageEvent) => {
      if (event.data === "signed-out") void refreshUser(true);
    };
    signOutChannel?.addEventListener("message", handleSignOutMessage);
    window.addEventListener(AUTH_CHANGED_EVENT, handleCurrentTabChange);
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
    window.addEventListener(AUTH_SESSION_OBSERVED_EVENT, handleSessionObserved);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("storage", handleStorage);
    return () => {
      signOutChannel?.removeEventListener("message", handleSignOutMessage);
      window.removeEventListener(AUTH_CHANGED_EVENT, handleCurrentTabChange);
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthenticationRequired);
      window.removeEventListener(AUTH_SESSION_OBSERVED_EVENT, handleSessionObserved);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
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
