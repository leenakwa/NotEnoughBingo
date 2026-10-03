import { existsSync, readFileSync } from "node:fs";

const release = process.env.NEXT_PUBLIC_APP_RELEASE ?? "";
if (!/^[a-f0-9]{40}$/.test(release)) {
  console.error(
    "NEXT_PUBLIC_APP_RELEASE must identify the built source with a full Git commit SHA.",
  );
  process.exit(1);
}
if (existsSync(".built-release") && readFileSync(".built-release", "utf8").trim() !== release) {
  console.error(
    "NEXT_PUBLIC_APP_RELEASE must match the release embedded when this image was built.",
  );
  process.exit(1);
}

const rawOrigin = process.env.NEXT_PUBLIC_APP_URL;
let origin;
const isNonProductionHost = (hostname) =>
  /\.(?:invalid|test)$/.test(hostname) ||
  /(?:^|[.-])(?:staging|stage|preview|qa|test|dev)(?:[.-]|$)/.test(hostname);

try {
  origin = new URL(rawOrigin);
} catch {
  // The error below also covers a missing or malformed origin.
}

if (
  !origin ||
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
) {
  console.error(
    "NEXT_PUBLIC_APP_URL must be an explicit public HTTPS origin for a production image.",
  );
  process.exit(1);
}

if (process.env.APP_ENVIRONMENT === "production" && isNonProductionHost(origin.hostname)) {
  console.error("Production cannot use a non-production public origin.");
  process.exit(1);
}

const publicApiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
if (publicApiBase.replace(/\/$/, "") !== "/api/v1") {
  console.error("NEXT_PUBLIC_API_BASE_URL must use the same-origin /api/v1 path.");
  process.exit(1);
}

let serverApiBase;
try {
  serverApiBase = new URL(process.env.API_BASE_URL);
} catch {
  // The error below also covers a missing or malformed backend API address.
}
if (
  !serverApiBase ||
  !["http:", "https:"].includes(serverApiBase.protocol) ||
  serverApiBase.username ||
  serverApiBase.password ||
  serverApiBase.pathname.replace(/\/$/, "") !== "/api/v1" ||
  serverApiBase.search ||
  serverApiBase.hash ||
  ["localhost", "127.0.0.1", "[::1]"].includes(serverApiBase.hostname) ||
  (process.env.APP_ENVIRONMENT === "production" && isNonProductionHost(serverApiBase.hostname))
) {
  console.error("API_BASE_URL must be an explicit non-local backend /api/v1 address.");
  process.exit(1);
}

if (existsSync(".built-origin")) {
  const builtOrigin = readFileSync(".built-origin", "utf8").trim();
  if (rawOrigin !== builtOrigin) {
    console.error("NEXT_PUBLIC_APP_URL must match the origin embedded when this image was built.");
    process.exit(1);
  }
}

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ?? "";
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
  console.error(
    "NEXT_PUBLIC_SUPPORT_EMAIL must be a valid support address for a production image.",
  );
  process.exit(1);
}
