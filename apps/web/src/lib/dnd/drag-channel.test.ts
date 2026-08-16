import { describe, expect, it } from "vitest";
import {
  createDragChannel,
  prepareDataTransferForMove,
} from "@/lib/dnd/drag-channel.ts";

function fakeDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    effectAllowed: "none",
    get types() {
      return [...store.keys()];
    },
    setData(type: string, value: string) {
      store.set(type, value);
    },
    getData(type: string) {
      return store.get(type) ?? "";
    },
    clearData(type: string) {
      store.delete(type);
    },
  } as unknown as DataTransfer;
}

describe("createDragChannel", () => {
  it("round-trips an id through its MIME type", () => {
    const channel = createDragChannel("application/x-test-id");
    const dataTransfer = fakeDataTransfer();

    channel.write(dataTransfer, "row-1");
    expect(channel.read(dataTransfer)).toBe("row-1");
    expect(dataTransfer.effectAllowed).toBe("move");
  });

  it("returns null when nothing was written", () => {
    const channel = createDragChannel("application/x-test-id");
    expect(channel.read(fakeDataTransfer())).toBeNull();
  });

  it("clears default link drag types before writing the custom MIME", () => {
    const dataTransfer = fakeDataTransfer();
    dataTransfer.setData("text/plain", "https://example.com");
    dataTransfer.setData("text/uri-list", "https://example.com\n");

    prepareDataTransferForMove(dataTransfer, "application/x-page-id", "page-1");

    expect(dataTransfer.getData("text/plain")).toBe("");
    expect(dataTransfer.getData("text/uri-list")).toBe("");
    expect(dataTransfer.getData("application/x-page-id")).toBe("page-1");
  });

  it("isolates payloads across channels", () => {
    const pages = createDragChannel("application/x-page-id");
    const rows = createDragChannel("application/x-canvas-row-id");
    const dataTransfer = fakeDataTransfer();

    pages.write(dataTransfer, "page-1");
    expect(rows.read(dataTransfer)).toBeNull();
    expect(pages.read(dataTransfer)).toBe("page-1");
  });
});
