import { describe, expect, it } from "vitest";

import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { isBlockEmpty } from "@/lib/blocks/is-block-empty.ts";
import { cloneBlocksForPaste } from "@/lib/canvas/clipboard.ts";
import { rewriteMediaBlocksToPublicUrls } from "@/lib/content/prepare-page-document-for-author-save.ts";
import {
  inferMediaKindFromMime,
  inferMediaKindFromUrl,
} from "@/lib/media/infer-media-kind.ts";
import { resolveEmbedProvider } from "@/lib/media/resolve-embed-provider.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { mediaPropsSchema } from "@/lib/schemas/block-props.ts";

describe("mediaPropsSchema", () => {
  it("accepts url-backed image props", () => {
    const parsed = mediaPropsSchema.parse({
      kind: "image",
      source: "url",
      src: "https://example.com/photo.png",
    });
    expect(parsed.kind).toBe("image");
  });

  it("accepts optional widthPercent", () => {
    const parsed = mediaPropsSchema.parse({
      kind: "image",
      source: "url",
      src: "https://example.com/photo.png",
      widthPercent: 60,
    });
    expect(parsed.widthPercent).toBe(60);
  });
});

describe("isBlockEmpty media/embed", () => {
  it("treats empty media src as empty", () => {
    const block = createEmptyBlock("media");
    expect(isBlockEmpty(block)).toBe(true);
  });

  it("treats empty embed url as empty", () => {
    const block = createEmptyBlock("embed");
    expect(isBlockEmpty(block)).toBe(true);
  });
});

describe("cloneBlocksForPaste media", () => {
  it("preserves asset src when cloning media blocks", () => {
    const block: Extract<Block, { type: "media" }> = {
      ...createEmptyBlock("media"),
      props: {
        kind: "image",
        source: "asset",
        src: "abc123",
        mimeType: "image/png",
      },
    };
    const [cloned] = cloneBlocksForPaste([block]);
    expect(cloned.id).not.toBe(block.id);
    expect(cloned.type).toBe("media");
    if (cloned.type === "media") {
      expect(cloned.props.src).toBe("abc123");
      expect(cloned.props.source).toBe("asset");
    }
  });
});

describe("rewriteMediaBlocksToPublicUrls", () => {
  it("rewrites asset media to public urls", () => {
    const block: Extract<Block, { type: "media" }> = {
      ...createEmptyBlock("media"),
      props: {
        kind: "image",
        source: "asset",
        src: "deadbeef",
        mimeType: "image/png",
      },
    };
    const [rewritten] = rewriteMediaBlocksToPublicUrls([block]);
    if (rewritten.type === "media") {
      expect(rewritten.props.source).toBe("url");
      expect(rewritten.props.src).toBe("/media/deadbeef.png");
    }
  });
});

describe("inferMediaKindFromUrl", () => {
  it("detects video extensions", () => {
    expect(inferMediaKindFromUrl("https://cdn.example.com/clip.mp4")).toBe(
      "video"
    );
  });

  it("defaults to image", () => {
    expect(inferMediaKindFromUrl("https://cdn.example.com/photo.jpg")).toBe(
      "image"
    );
  });
});

describe("inferMediaKindFromMime", () => {
  it("detects video mime types", () => {
    expect(inferMediaKindFromMime("video/mp4")).toBe("video");
  });
});

describe("resolveEmbedProvider", () => {
  it("parses youtube watch urls", () => {
    expect(
      resolveEmbedProvider("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        ?.embedUrl
    ).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("parses vimeo urls", () => {
    expect(resolveEmbedProvider("https://vimeo.com/123456789")?.embedUrl).toBe(
      "https://player.vimeo.com/video/123456789"
    );
  });
});
