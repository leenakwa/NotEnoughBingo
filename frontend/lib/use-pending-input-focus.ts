"use client";

import { useEffect, useRef } from "react";

type FocusRestore = {
  input: HTMLInputElement;
  ownsRequest: () => boolean;
  finished: boolean;
  cancel: () => void;
};

export function usePendingInputFocus(pending: boolean) {
  const restore = useRef<FocusRestore | null>(null);

  // A fast response can batch the pending and settled states into one commit.
  useEffect(() => {
    const request = restore.current;
    if (!request) return;
    if (!request.ownsRequest() || !request.input.isConnected) {
      request.cancel();
    } else if (!pending && request.finished) {
      const document = request.input.ownerDocument;
      const shouldRestore =
        !request.input.disabled && document.activeElement === document.body && document.hasFocus();
      request.cancel();
      if (shouldRestore) request.input.focus({ preventScroll: true });
    }
  });

  useEffect(() => () => restore.current?.cancel(), []);

  return (input: HTMLInputElement, ownsRequest: () => boolean) => {
    restore.current?.cancel();
    const document = input.ownerDocument;
    const window = document.defaultView;
    if (document.activeElement !== input || !window) return () => undefined;

    const cancel = () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("pointerdown", cancel, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", cancel);
      if (restore.current === request) restore.current = null;
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target !== input && event.target !== document.body) cancel();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") cancel();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    const request: FocusRestore = { input, ownsRequest, finished: false, cancel };
    restore.current = request;
    document.addEventListener("focusin", onFocus);
    document.addEventListener("pointerdown", cancel, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", cancel);

    return () => {
      if (!ownsRequest()) cancel();
      else request.finished = true;
    };
  };
}
