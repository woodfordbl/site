import { describe, expect, it } from "vitest";

import {
  assertSafeUnfurlUrl,
  parseUrlPreviewFromHtml,
} from "@/lib/media/parse-url-preview.ts";

describe("assertSafeUnfurlUrl", () => {
  it("accepts public https URLs", () => {
    expect(assertSafeUnfurlUrl("https://example.com").hostname).toBe(
      "example.com"
    );
  });

  it("rejects localhost", () => {
    expect(() => assertSafeUnfurlUrl("http://localhost/page")).toThrow(
      "Local URLs are not allowed"
    );
  });

  it("rejects private IPv4", () => {
    expect(() => assertSafeUnfurlUrl("http://192.168.1.1/page")).toThrow(
      "Private network URLs are not allowed"
    );
  });
});

describe("parseUrlPreviewFromHtml", () => {
  it("extracts og tags and resolves relative image URLs", () => {
    const html = `
      <html>
        <head>
          <title>Fallback title</title>
          <meta property="og:title" content="OG Title" />
          <meta property="og:description" content="A description" />
          <meta property="og:image" content="/preview.png" />
        </head>
      </html>
    `;

    expect(parseUrlPreviewFromHtml(html, "https://example.com/page")).toEqual({
      title: "OG Title",
      description: "A description",
      imageUrl: "https://example.com/preview.png",
    });
  });

  it("falls back to document title", () => {
    const html = "<html><head><title>Page title</title></head></html>";
    expect(parseUrlPreviewFromHtml(html, "https://example.com")).toEqual({
      title: "Page title",
    });
  });
});
