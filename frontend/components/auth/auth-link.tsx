"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { openAuthDialog, type AuthDialogMode } from "@/lib/auth-events";

export function AuthLink({ href, onClick, ...props }: ComponentProps<typeof Link>) {
  const path = typeof href === "string" ? (href.split("?")[0] ?? "") : "";
  const modal = ["/login", "/register", "/forgot-password"].includes(path);

  return (
    <Link
      {...props}
      href={href}
      data-auth-dialog={modal ? "true" : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (
          !modal ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (event.currentTarget.target && event.currentTarget.target !== "_self") ||
          event.currentTarget.hasAttribute("download")
        )
          return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        const destination = new URL(event.currentTarget.href);
        openAuthDialog({
          mode: path.slice(1) as AuthDialogMode,
          reason: destination.searchParams.get("reason"),
        });
      }}
    />
  );
}
