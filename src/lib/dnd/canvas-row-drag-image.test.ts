// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { resolveCanvasRowDragPreviewNode } from "@/lib/dnd/canvas-row-drag-image.ts";

describe("resolveCanvasRowDragPreviewNode", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: {
        escape: (value: string) =>
          value.replace(/\\/g, "\\\\").replace(/"/g, '\\"'),
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns canvas row content when present", () => {
    const shell = document.createElement("div");
    shell.setAttribute("data-canvas-row-id", "row-1");
    const content = document.createElement("div");
    content.setAttribute("data-canvas-row-content", "");
    shell.appendChild(content);
    document.body.appendChild(shell);

    expect(resolveCanvasRowDragPreviewNode("row-1")).toBe(content);
  });

  it("falls back to a table row element", () => {
    const row = document.createElement("tr");
    row.setAttribute("data-table-row-id", "row-2");
    document.body.appendChild(row);

    expect(resolveCanvasRowDragPreviewNode("row-2")).toBe(row);
  });
});
