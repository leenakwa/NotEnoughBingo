import { existsSync, readFileSync } from "node:fs";

const rawOrigin = process.env.NEXT_PUBLIC_APP_URL;
let origin;

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
  ["localhost", "127.0.0.1", "::1"].includes(origin.hostname)
) {
  console.error(
    "NEXT_PUBLIC_APP_URL must be an explicit public HTTPS origin for a production image.",
  );
  process.exit(1);
}

if (process.env.APP_ENVIRONMENT === "production" && /\.(?:invalid|test)$/.test(origin.hostname)) {
  console.error("Production cannot use a test or CI-only public origin.");
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
