import { describe, expect, it } from "vitest";

import { resolveEmbedDisplay } from "@/lib/media/resolve-embed-display.ts";

describe("resolveEmbedDisplay", () => {
  it("classifies YouTube watch URLs as provider", () => {
    expect(
      resolveEmbedDisplay("https://www.youtube.com/watch?v=dQw4w9WgXcQ").kind
    ).toBe("provider");
  });

  it("classifies direct image URLs", () => {
    expect(resolveEmbedDisplay("https://cdn.example.com/photo.jpg").kind).toBe(
      "directImage"
    );
  });

  it("classifies plain page URLs as bookmark", () => {
    expect(resolveEmbedDisplay("https://example.com").kind).toBe("bookmark");
  });

  it("does not treat extensionless URLs as direct image", () => {
    expect(resolveEmbedDisplay("https://example.com/image").kind).toBe(
      "bookmark"
    );
  });
});
