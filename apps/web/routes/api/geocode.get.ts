import { defineHandler } from "nitro";
import { getQuery, setResponseHeader, setResponseStatus } from "nitro/h3";

import { SITE_ORIGIN } from "@/lib/content/site-origin.ts";
import type { GeocodeResult } from "@/lib/geocode/geocode-search.ts";

/**
 * `GET /api/geocode?q=1600+Amphitheatre+Parkway` — address → coordinates for
 * `location` cells, proxying Nominatim (OpenStreetMap).
 *
 * Same-origin rather than called from the browser for two reasons: Nominatim's
 * usage policy wants a single identifying `User-Agent` per application, which a
 * page cannot set, and routing through here lets the response carry
 * `Cache-Control` so a repeated search is served from the edge instead of
 * hitting the upstream again. The policy also forbids per-keystroke
 * autocomplete, so the client searches only on an explicit submit — see
 * `lib/geocode/geocode-search.ts`.
 *
 * Needs no API key: an unconfigured deployment still geocodes. Results carry
 * OSM's display name as the label; attribution is rendered next to them.
 */

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const MAX_QUERY_LENGTH = 200;
const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 5;
const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;

/**
 * Identifies this application to Nominatim, whose policy requires it. Override
 * with `GEOCODE_USER_AGENT` when running a fork, so a blocked agent string is
 * never shared between deployments.
 */
const USER_AGENT =
  process.env.GEOCODE_USER_AGENT ?? `site-notes-app (${SITE_ORIGIN})`;

interface RawNominatimPlace {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
}

/** Keep only places carrying a usable label and a parseable point. */
function toResult(place: RawNominatimPlace): GeocodeResult | null {
  const label =
    typeof place.display_name === "string" ? place.display_name.trim() : "";
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (label === "" || !(Number.isFinite(lat) && Number.isFinite(lng))) {
    return null;
  }
  return { label, lat, lng };
}

export default defineHandler(
  async (event): Promise<{ results: GeocodeResult[] } | { error: string }> => {
    const term = firstString(getQuery(event).q).trim();
    if (term.length < MIN_QUERY_LENGTH || term.length > MAX_QUERY_LENGTH) {
      setResponseStatus(event, HTTP_BAD_REQUEST);
      return { error: "Search for a place with 2 to 200 characters." };
    }

    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set("q", term);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(RESULT_LIMIT));
    url.searchParams.set("addressdetails", "0");

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "Accept-Language": "en", "User-Agent": USER_AGENT },
      });
    } catch {
      // Offline, DNS failure, blocked egress: the cell editor says so and
      // still accepts "lat, lng" typed by hand.
      setResponseStatus(event, HTTP_BAD_GATEWAY);
      return { error: "Could not reach the geocoding service." };
    }

    if (!response.ok) {
      setResponseStatus(event, HTTP_BAD_GATEWAY);
      return { error: `Geocoding request failed (${response.status}).` };
    }

    const payload = (await response.json()) as unknown;
    const places = Array.isArray(payload)
      ? (payload as RawNominatimPlace[])
      : [];
    const results = places
      .map(toResult)
      .filter((result): result is GeocodeResult => result !== null);

    // A day: a street address does not move, and cached hits are how this stays
    // inside Nominatim's rate policy.
    setResponseHeader(event, "Cache-Control", "public, max-age=86400");
    return { results };
  }
);
