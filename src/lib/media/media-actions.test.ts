import { describe, expect, it } from "vitest";

import { resolveMediaLinkUrl } from "@/lib/media/media-actions.ts";

describe("resolveMediaLinkUrl", () => {
  it("returns external src for url-backed media", () => {
    expect(
      resolveMediaLinkUrl(
        {
          kind: "image",
          source: "url",
          src: "https://example.com/photo.png",
        },
        "https://example.com/photo.png"
      )
    ).toBe("https://example.com/photo.png");
  });

  it("returns display url for asset-backed media", () => {
    expect(
      resolveMediaLinkUrl(
        {
          kind: "image",
          source: "asset",
          src: "abc123",
        },
        "blob:https://localhost/abc"
      )
    ).toBe("blob:https://localhost/abc");
  });
});
