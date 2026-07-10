import { afterEach, describe, expect, it, vi } from "vitest";

import {
  copyMediaImage,
  resolveMediaLinkUrl,
} from "@/lib/media/media-actions.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

describe("copyMediaImage", () => {
  it("returns false when clipboard write is unavailable", async () => {
    vi.stubGlobal("navigator", { clipboard: undefined });

    await expect(
      copyMediaImage(
        {
          kind: "image",
          source: "url",
          src: "https://example.com/photo.jpg",
        },
        "https://example.com/photo.jpg"
      )
    ).resolves.toBe(false);
  });

  it("returns false for video media", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { write: vi.fn() },
    });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public items: Record<string, unknown>) {}
      }
    );

    await expect(
      copyMediaImage(
        {
          kind: "video",
          source: "url",
          src: "https://example.com/clip.mp4",
        },
        "https://example.com/clip.mp4"
      )
    ).resolves.toBe(false);
  });

  it("writes a Promise-valued PNG ClipboardItem during the call", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { write },
    });

    class FakeClipboardItem {
      items: Record<string, unknown>;
      constructor(items: Record<string, unknown>) {
        this.items = items;
      }
    }
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);

    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
      type: "image/jpeg",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => jpeg,
      })
    );

    const png = new Blob(["png"], { type: "image/png" });
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 2,
        height: 2,
        close,
      })
    );

    const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
      expect(type).toBe("image/png");
      callback(png);
    });
    const drawImage = vi.fn();
    const getContext = vi.fn().mockReturnValue({ drawImage });
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue({
        width: 0,
        height: 0,
        getContext,
        toBlob,
      }),
    });

    const result = await copyMediaImage(
      {
        kind: "image",
        source: "url",
        src: "https://example.com/photo.jpg",
      },
      "https://example.com/photo.jpg"
    );

    expect(result).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0]?.[0]?.[0] as FakeClipboardItem;
    expect(item).toBeInstanceOf(FakeClipboardItem);
    expect(item.items["image/png"]).toBeInstanceOf(Promise);
    await expect(item.items["image/png"]).resolves.toBe(png);
    expect(close).toHaveBeenCalled();
  });
});
