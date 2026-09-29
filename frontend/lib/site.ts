const fallbackSiteUrl = "http://localhost:3000";

export function siteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  try {
    return new URL(configured || fallbackSiteUrl);
  } catch {
    return new URL(fallbackSiteUrl);
  }
}

export function absoluteSiteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}

export function shortDescription(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > 180 ? `${normalized.slice(0, 177).trimEnd()}…` : normalized;
}
