/**
 * @fileoverview Client side of the geocode proxy: turn a typed address into
 * candidate places for a `location` cell.
 *
 * Searching happens on an explicit submit, never per keystroke — Nominatim's
 * usage policy forbids autocomplete-style traffic, and `routes/api/geocode.get.ts`
 * documents the rest of that contract. Failures are values, not exceptions: the
 * editor shows the message and still accepts a pasted "lat, lng", so a place can
 * always be entered offline or with the service down.
 */

/** One candidate place: a formatted label and the point it resolves to. */
export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

export type GeocodeSearchOutcome =
  | { kind: "results"; results: GeocodeResult[] }
  | { kind: "error"; message: string };

const GEOCODE_ENDPOINT = "/api/geocode";

const GENERIC_ERROR = "Could not search for that place.";

function errorMessage(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return GENERIC_ERROR;
}

/**
 * Search the proxy for `query`. `signal` lets a superseded search be abandoned;
 * an aborted request resolves to an empty result list rather than throwing, so
 * callers need no try/catch around navigation-time cancellation.
 */
export async function searchGeocode(
  query: string,
  signal?: AbortSignal
): Promise<GeocodeSearchOutcome> {
  const term = query.trim();
  if (term === "") {
    return { kind: "results", results: [] };
  }

  let response: Response;
  try {
    response = await fetch(
      `${GEOCODE_ENDPOINT}?q=${encodeURIComponent(term)}`,
      { signal }
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { kind: "results", results: [] };
    }
    return { kind: "error", message: GENERIC_ERROR };
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    return { kind: "error", message: errorMessage(payload) };
  }

  const results =
    typeof payload === "object" &&
    payload !== null &&
    Array.isArray((payload as { results?: unknown }).results)
      ? ((payload as { results: GeocodeResult[] }).results ?? [])
      : [];
  return { kind: "results", results };
}
