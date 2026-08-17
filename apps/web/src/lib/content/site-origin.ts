const TRAILING_SLASH_RE = /\/$/;
const FALLBACK_ORIGIN = "http://localhost:3000";

/**
 * Absolute site origin (no trailing slash), baked in at build time via the
 * `VITE_SITE_ORIGIN` define in `vite.config.ts`. Used for canonical links and
 * Open Graph / Twitter image URLs, which must be absolute and identical across
 * SSR and client renders to avoid hydration mismatches.
 */
export const SITE_ORIGIN = (
  import.meta.env.VITE_SITE_ORIGIN || FALLBACK_ORIGIN
).replace(TRAILING_SLASH_RE, "");
