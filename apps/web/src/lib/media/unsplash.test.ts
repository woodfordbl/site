import { describe, expect, it } from "vitest";

import { unsplashCdnUrl, withUnsplashUtm } from "@/lib/media/unsplash.ts";

describe("unsplashCdnUrl", () => {
  it("appends sizing/encoding params to images.unsplash.com URLs", () => {
    const out = unsplashCdnUrl(
      "https://images.unsplash.com/photo-123?ixid=abc",
      { width: 2000 }
    );
    const url = new URL(out);
    expect(url.searchParams.get("w")).toBe("2000");
    expect(url.searchParams.get("q")).toBe("80");
    expect(url.searchParams.get("auto")).toBe("format");
    expect(url.searchParams.get("fit")).toBe("crop");
    // Pre-existing params are preserved.
    expect(url.searchParams.get("ixid")).toBe("abc");
  });

  it("leaves non-Unsplash URLs untouched", () => {
    const other = "https://example.com/cover.jpg";
    expect(unsplashCdnUrl(other, { width: 2000 })).toBe(other);
  });

  it("returns the input unchanged when it is not a valid URL", () => {
    expect(unsplashCdnUrl("not a url", { width: 800 })).toBe("not a url");
  });
});

describe("withUnsplashUtm", () => {
  it("adds the required referral UTM params", () => {
    const url = new URL(withUnsplashUtm("https://unsplash.com/@photographer"));
    expect(url.searchParams.get("utm_source")).toBe("blake_woodford_site");
    expect(url.searchParams.get("utm_medium")).toBe("referral");
  });
});
