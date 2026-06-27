import { defineHandler } from "nitro";
import { getQuery, setResponseHeader, setResponseStatus } from "nitro/h3";

import type {
  UnsplashSearchResponse,
  UnsplashSearchResult,
} from "@/lib/media/unsplash.ts";

/**
 * `GET /api/unsplash/search?q=…&page=1` — server-side proxy for Unsplash photo
 * search.
 *
 * The Unsplash Access Key lives only in `UNSPLASH_ACCESS_KEY` (server env) and
 * is never exposed to the browser — the client only ever calls this route. Only
 * the Access Key is needed for search (the Secret Key is OAuth-only and is not
 * used here). Responses are trimmed to the fields the picker/cover need and
 * cached briefly to spare the rate quota, since the route is publicly reachable.
 */

const PER_PAGE = 24;
const ENDPOINT = "https://api.unsplash.com/search/photos";

function firstString(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
}

interface RawUnsplashPhoto {
  alt_description: string | null;
  description: string | null;
  id: string;
  links: { download_location: string };
  urls: { regular: string; small: string };
  user: { name: string; username: string; links: { html: string } };
}

export default defineHandler(
  async (event): Promise<UnsplashSearchResponse | { error: string }> => {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
      setResponseStatus(event, 503);
      return {
        error: "Unsplash is not configured (missing UNSPLASH_ACCESS_KEY).",
      };
    }

    const query = getQuery(event);
    const term = firstString(query.q).trim();
    if (!term) {
      return { results: [], totalPages: 0 };
    }
    const pageNumber = Math.max(
      1,
      Number.parseInt(firstString(query.page), 10) || 1
    );

    const url = new URL(ENDPOINT);
    url.searchParams.set("query", term);
    url.searchParams.set("page", String(pageNumber));
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("content_filter", "high");

    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
    });

    if (!response.ok) {
      setResponseStatus(event, response.status === 403 ? 429 : 502);
      return { error: `Unsplash request failed (${response.status}).` };
    }

    const payload = (await response.json()) as {
      results: RawUnsplashPhoto[];
      total_pages: number;
    };

    const results: UnsplashSearchResult[] = payload.results.map((photo) => ({
      id: photo.id,
      thumbUrl: photo.urls.small,
      regularUrl: photo.urls.regular,
      alt: photo.alt_description ?? photo.description ?? "",
      credit: {
        name: photo.user.name,
        username: photo.user.username,
        link: photo.user.links.html,
      },
      downloadLocation: photo.links.download_location,
    }));

    setResponseHeader(event, "Cache-Control", "public, max-age=300");
    return { results, totalPages: payload.total_pages };
  }
);
