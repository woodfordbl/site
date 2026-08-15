const TRAILING_SLASH_RE = /\/$/;

/**
 * Resolve the canonical production origin for absolute URLs (sitemap, OG
 * images, canonical links). Precedence: explicit SITE_ORIGIN, then the Vercel
 * production domain. Returns null when neither is set (e.g. plain local dev),
 * so callers can decide on a fallback.
 */
export function resolveSiteOrigin() {
  if (process.env.SITE_ORIGIN) {
    return process.env.SITE_ORIGIN.replace(TRAILING_SLASH_RE, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return null;
}
