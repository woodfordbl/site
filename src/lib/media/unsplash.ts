/**
 * Shared Unsplash helpers + the trimmed result shape our Nitro proxy returns to
 * the client. The Unsplash Access Key never reaches the browser — the client
 * only ever talks to `/api/unsplash/*` (see routes/api/unsplash/*).
 *
 * Attribution + UTM tagging are required by the Unsplash API Guidelines:
 * https://help.unsplash.com/en/articles/2511315-guideline-attribution
 */

/** App name registered with Unsplash; used for the required `utm_source`. */
export const UNSPLASH_APP_NAME = "blake_woodford_site";

export const UNSPLASH_HOME_URL = "https://unsplash.com";

/** Appends the Unsplash-required referral UTM params to a profile/site link. */
export function withUnsplashUtm(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("utm_source", UNSPLASH_APP_NAME);
    parsed.searchParams.set("utm_medium", "referral");
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Photographer attribution carried on every Unsplash cover. */
export interface UnsplashCredit {
  /** Photographer profile URL (UTM appended at render time). */
  link: string;
  name: string;
  username: string;
}

/** One search hit, trimmed by the proxy to just what the picker/cover need. */
export interface UnsplashSearchResult {
  alt: string;
  credit: UnsplashCredit;
  /** Endpoint to ping when the photo is selected (Unsplash download trigger). */
  downloadLocation: string;
  id: string;
  /** Regular-size hotlink stored as the cover `src` (never re-hosted). */
  regularUrl: string;
  /** Small thumbnail for the picker grid. */
  thumbUrl: string;
}

export interface UnsplashSearchResponse {
  results: UnsplashSearchResult[];
  totalPages: number;
}
