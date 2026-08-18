import { afterEach, describe, expect, it, vi } from "vitest";

import { searchGeocode } from "@/lib/geocode/geocode-search.ts";

function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response
): void {
  vi.stubGlobal("fetch", vi.fn(handler as typeof fetch));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchGeocode", () => {
  it("returns the proxy's results", async () => {
    const results = [
      { label: "Kourou, French Guiana", lat: 5.239, lng: -52.7683 },
    ];
    stubFetch(() => jsonResponse({ results }));

    expect(await searchGeocode("Kourou")).toEqual({ kind: "results", results });
  });

  it("encodes the query into the request", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ results: [] }));
    stubFetch(fetchMock as unknown as typeof fetch);

    await searchGeocode("  1600 Amphitheatre Pkwy  ");

    expect(fetchMock.mock.calls.at(0)?.at(0)).toBe(
      "/api/geocode?q=1600%20Amphitheatre%20Pkwy"
    );
  });

  it("never calls the proxy for a blank query", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ results: [] }));
    stubFetch(fetchMock as unknown as typeof fetch);

    expect(await searchGeocode("   ")).toEqual({
      kind: "results",
      results: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the proxy's error message", async () => {
    stubFetch(() =>
      jsonResponse({ error: "Could not reach the geocoding service." }, 502)
    );

    expect(await searchGeocode("Kourou")).toEqual({
      kind: "error",
      message: "Could not reach the geocoding service.",
    });
  });

  it("falls back to a generic message when the failure carries no text", async () => {
    stubFetch(() => new Response("<html>gateway</html>", { status: 502 }));

    expect(await searchGeocode("Kourou")).toEqual({
      kind: "error",
      message: "Could not search for that place.",
    });
  });

  it("reports a network failure as an error, not a throw", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    expect(await searchGeocode("Kourou")).toEqual({
      kind: "error",
      message: "Could not search for that place.",
    });
  });

  it("treats an abort as an empty result", async () => {
    // A superseded search must not paint an error over the editor.
    stubFetch(() => Promise.reject(new DOMException("Aborted", "AbortError")));

    expect(await searchGeocode("Kourou")).toEqual({
      kind: "results",
      results: [],
    });
  });

  it("reads a malformed success payload as no results", async () => {
    stubFetch(() => jsonResponse({ unexpected: true }));

    expect(await searchGeocode("Kourou")).toEqual({
      kind: "results",
      results: [],
    });
  });
});
