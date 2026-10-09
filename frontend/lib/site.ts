const fallbackSiteUrl = "http://localhost:3000";

export function isPublicProduction(): boolean {
  return process.env.APP_ENVIRONMENT === "production";
}

export function siteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  let url: URL;
  try {
    url = new URL(configured || fallbackSiteUrl);
  } catch {
    if (isPublicProduction()) throw new Error("Production requires a valid NEXT_PUBLIC_APP_URL");
    url = new URL(fallbackSiteUrl);
  }
  if (
    isPublicProduction() &&
    (!configured ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      /\.(?:invalid|test)$/.test(url.hostname))
  ) {
    throw new Error("Production requires a public HTTPS NEXT_PUBLIC_APP_URL origin");
  }
  return url;
}

export function absoluteSiteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}

export function shortDescription(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > 180 ? `${normalized.slice(0, 177).trimEnd()}…` : normalized;
}
