import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  assertSafeUnfurlUrl,
  parseUrlPreviewFromHtml,
} from "@/lib/media/parse-url-preview.ts";

const UNFURL_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 512_000;

const unfurlInputSchema = z.object({
  url: z.string().min(1),
});

async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UNFURL_TIMEOUT_MS);

  try {
    const response = await fetch(url.href, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "site-embed-unfurl/1.0",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL (${response.status})`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !(
        contentType.includes("text/html") ||
        contentType.includes("application/xhtml")
      )
    ) {
      return "";
    }

    const buffer = await response.arrayBuffer();
    const slice =
      buffer.byteLength > MAX_HTML_BYTES
        ? buffer.slice(0, MAX_HTML_BYTES)
        : buffer;
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } finally {
    clearTimeout(timeout);
  }
}

export const unfurlEmbedUrl = createServerFn({ method: "POST" })
  .validator((data: unknown) => unfurlInputSchema.parse(data))
  .handler(async ({ data }) => {
    const parsed = assertSafeUnfurlUrl(data.url);
    const html = await fetchHtml(parsed);
    if (!html) {
      return {};
    }
    return parseUrlPreviewFromHtml(html, parsed.href);
  });
