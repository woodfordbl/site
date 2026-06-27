import { defineHandler } from "nitro";
import { readBody, setResponseStatus } from "nitro/h3";

/**
 * `POST /api/unsplash/download` — pings an Unsplash photo's `download_location`
 * when the user selects it.
 *
 * Triggering the download endpoint is required by the Unsplash API Guidelines
 * (it is how photographers get credited usage). Proxied so the Access Key stays
 * server-side. The body must carry a `downloadLocation` that points at the
 * Unsplash API host — anything else is rejected so the route can't be used as an
 * open relay.
 */

export default defineHandler(
  async (event): Promise<{ ok: boolean; error?: string }> => {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
      setResponseStatus(event, 503);
      return { ok: false, error: "Unsplash is not configured." };
    }

    const body = (await readBody(event)) as { downloadLocation?: unknown };
    const downloadLocation =
      typeof body?.downloadLocation === "string" ? body.downloadLocation : "";

    let parsed: URL;
    try {
      parsed = new URL(downloadLocation);
    } catch {
      setResponseStatus(event, 400);
      return { ok: false, error: "Invalid download location." };
    }
    if (parsed.hostname !== "api.unsplash.com") {
      setResponseStatus(event, 400);
      return { ok: false, error: "Unexpected download host." };
    }

    const response = await fetch(parsed, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
    });

    if (!response.ok) {
      setResponseStatus(event, 502);
      return {
        ok: false,
        error: `Download trigger failed (${response.status}).`,
      };
    }

    return { ok: true };
  }
);
