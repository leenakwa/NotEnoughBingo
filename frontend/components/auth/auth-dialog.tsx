"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AUTH_DIALOG_EVENT, type AuthDialogRequest } from "@/lib/auth-events";

const AuthDialogWindow = dynamic(() => import("./auth-dialog-window"));

export function AuthDialog() {
  const pathname = usePathname();
  const [request, setRequest] = useState<AuthDialogRequest | null>(null);
  const close = useCallback(() => setRequest(null), []);

  useEffect(() => {
    const open = (event: Event) => setRequest((event as CustomEvent<AuthDialogRequest>).detail);
    window.addEventListener(AUTH_DIALOG_EVENT, open);
    return () => window.removeEventListener(AUTH_DIALOG_EVENT, open);
  }, []);

  useEffect(() => {
    setRequest((current) => (current?.mode === "language-preferences" ? current : null));
  }, [pathname]);

  return request ? <AuthDialogWindow request={request} onClose={close} /> : null;
}
