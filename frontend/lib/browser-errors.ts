type ErrorKind = "boundary" | "exception" | "rejection" | "api";
type Frame = { filename: string; lineno: number; colno: number };

const errorTypes = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "ApiClientError",
  "UnhandledRejection",
]);
const surfaces = new Set([
  "discover",
  "trending",
  "explore",
  "create",
  "profile",
  "bingo",
  "share",
  "support",
  "notifications",
]);
const authRoutes = new Set([
  "login",
  "register",
  "verify-email",
  "forgot-password",
  "reset-password",
  "confirm-email-change",
]);
const seenErrors = new WeakSet<object>();
let recent: { key: string; time: number }[] = [];
const csrfCookieName = process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "neb_csrf";
// Next embeds this value in the loaded bundle; a later backend rollout cannot relabel it.
const buildRelease = process.env.NEXT_PUBLIC_APP_RELEASE ?? "";
const clientRelease = /^[a-f0-9]{40}$/.test(buildRelease) ? buildRelease : null;
let documentLeaving = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    documentLeaving = true;
  });
  window.addEventListener("pageshow", () => {
    documentLeaving = false;
  });
}

function surface(): string {
  const route = window.location.pathname.split("/")[1] ?? "";
  if (surfaces.has(route)) return route;
  if (authRoutes.has(route)) return "auth";
  if (["privacy", "terms", "community-guidelines"].includes(route)) return "legal";
  return "unknown";
}

function framesFor(error: unknown): Frame[] {
  if (!(error instanceof Error) || !error.stack) return [];
  const loadedChunks = new Set<string>();
  const sources = [
    ...Array.from(document.scripts, (script) => script.src),
    ...(typeof performance.getEntriesByType === "function"
      ? performance.getEntriesByType("resource").map((entry) => entry.name)
      : []),
  ];
  for (const source of sources) {
    if (!source) continue;
    try {
      const url = new URL(source, window.location.origin);
      if (url.origin === window.location.origin) loadedChunks.add(url.pathname);
    } catch {
      // Ignore malformed resource locations.
    }
  }
  const frames: Frame[] = [];
  const stack = error.stack
    .slice(0, 12_000)
    .split("\n")
    .filter((line) => /^\s*at\s/.test(line) || /@https?:\/\//.test(line))
    .join("\n");
  for (const match of stack.matchAll(/(https?:\/\/[^\s()]+):(\d+):(\d+)/g)) {
    if (!match[1]) continue;
    const url = new URL(match[1]);
    const lineno = Number(match[2]);
    const colno = Number(match[3]);
    if (
      url.origin === window.location.origin &&
      loadedChunks.has(url.pathname) &&
      /^\/_next\/static\/chunks\/[A-Za-z0-9_./-]+\.js$/.test(url.pathname) &&
      url.pathname.length <= 240 &&
      [lineno, colno].every((position) => position >= 1 && position <= 10_000_000)
    ) {
      frames.push({ filename: url.pathname, lineno, colno });
      if (frames.length === 8) break;
    }
  }
  return frames;
}

async function sendReport(report: object): Promise<void> {
  if (documentLeaving) return;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const cookie = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${encodeURIComponent(csrfCookieName)}=`));
    let csrf = cookie ? decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)) : null;
    if (!csrf) {
      const response = await fetch("/api/v1/auth/csrf/", {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        keepalive: true,
      });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (data && typeof data === "object" && "csrf" in data && typeof data.csrf === "string") {
        csrf = data.csrf;
      }
    }
    if (!csrf || documentLeaving) return;
    await fetch("/api/v1/client-errors/", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrf,
        ...(clientRelease ? { "X-NEB-Client-Release": clientRelease } : {}),
      },
      body: JSON.stringify(report),
      signal: controller.signal,
      keepalive: true,
    });
  } catch {
    // Reporting is best effort and must never trigger another error report.
  } finally {
    window.clearTimeout(timer);
  }
}

export function reportBrowserError(
  error: unknown,
  kind: ErrorKind = "exception",
  status?: number,
): void {
  if (typeof window === "undefined" || documentLeaving) return;
  try {
    if (error && typeof error === "object") {
      if (seenErrors.has(error)) return;
      seenErrors.add(error);
    }
    const errorType =
      error instanceof Error && errorTypes.has(error.name)
        ? error.name
        : kind === "rejection"
          ? "UnhandledRejection"
          : "Error";
    const report = {
      kind,
      error_type: errorType,
      surface: surface(),
      frames: framesFor(error),
      ...(typeof status === "number" && Number.isInteger(status) && status >= 0 && status <= 599
        ? { status_code: status }
        : {}),
    };
    const key = JSON.stringify(report);
    const now = Date.now();
    recent = recent.filter((item) => now - item.time < 60_000);
    if (recent.length >= 5 || recent.some((item) => item.key === key)) return;
    recent.push({ key, time: now });
    void sendReport(report);
  } catch {
    // Hostile error objects and malformed stacks cannot break the user flow.
  }
}
