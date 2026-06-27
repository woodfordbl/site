import { describe, expect, it } from "vitest";

import {
  buildAssetMediaBlock,
  extractMediaFiles,
  isMediaFile,
} from "@/lib/media/paste-media.ts";

function file(name: string, type: string): File {
  return new File(["bytes"], name, { type });
}

function dataTransferWith(files: File[]): DataTransfer {
  return { files } as unknown as DataTransfer;
}

describe("isMediaFile", () => {
  it("accepts image and video files", () => {
    expect(isMediaFile(file("a.png", "image/png"))).toBe(true);
    expect(isMediaFile(file("a.mp4", "video/mp4"))).toBe(true);
  });

  it("rejects non-media files", () => {
    expect(isMediaFile(file("a.txt", "text/plain"))).toBe(false);
    expect(isMediaFile(file("a.pdf", "application/pdf"))).toBe(false);
  });
});

describe("extractMediaFiles", () => {
  it("returns an empty list for null data", () => {
    expect(extractMediaFiles(null)).toEqual([]);
  });

  it("keeps only media files", () => {
    const png = file("shot.png", "image/png");
    const txt = file("note.txt", "text/plain");
    expect(extractMediaFiles(dataTransferWith([png, txt]))).toEqual([png]);
  });

  it("returns an empty list when no files are present", () => {
    expect(extractMediaFiles(dataTransferWith([]))).toEqual([]);
  });
});

describe("buildAssetMediaBlock", () => {
  it("builds an asset-backed image block", () => {
    const block = buildAssetMediaBlock({
      assetId: "abc123",
      mimeType: "image/png",
      fileName: "shot.png",
    });
    expect(block.type).toBe("media");
    expect(block.props).toMatchObject({
      kind: "image",
      source: "asset",
      src: "abc123",
      mimeType: "image/png",
      fileName: "shot.png",
    });
  });

  it("infers the video kind from the mime type", () => {
    const block = buildAssetMediaBlock({
      assetId: "deadbeef",
      mimeType: "video/mp4",
    });
    expect(block.props.kind).toBe("video");
  });

  it("omits an empty file name", () => {
    const block = buildAssetMediaBlock({
      assetId: "abc123",
      mimeType: "image/png",
      fileName: "   ",
    });
    expect(block.props.fileName).toBeUndefined();
  });
});
