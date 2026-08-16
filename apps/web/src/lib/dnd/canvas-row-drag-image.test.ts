// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { resolveCanvasRowDragPreviewSource } from "@/lib/dnd/canvas-row-drag-image.ts";

describe("resolveCanvasRowDragPreviewSource", () => {
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

    const source = resolveCanvasRowDragPreviewSource("row-1");
    expect(source?.node).toBe(content);
    // Connected nodes anchor on their own live rect.
    expect(source?.origin).toBeUndefined();
  });

  it("prefers the table grid for a table block so the preview keeps its size", () => {
    const shell = document.createElement("div");
    shell.setAttribute("data-canvas-row-id", "table-1");
    const content = document.createElement("div");
    content.setAttribute("data-canvas-row-content", "");
    const layout = document.createElement("div");
    layout.setAttribute("data-table-layout", "");
    layout.setAttribute("data-table-id", "table-1");
    const table = document.createElement("table");
    layout.appendChild(table);
    content.appendChild(layout);
    shell.appendChild(content);
    document.body.appendChild(shell);

    expect(resolveCanvasRowDragPreviewSource("table-1")?.node).toBe(table);
  });

  it("builds a full-block preview with title, chips, and flattened grid", () => {
    const shell = document.createElement("div");
    shell.setAttribute("data-canvas-row-id", "db-1");
    const content = document.createElement("div");
    content.setAttribute("data-canvas-row-content", "");
    const block = document.createElement("div");
    block.setAttribute("data-database-block", "");

    const title = document.createElement("div");
    title.setAttribute("data-database-title", "");
    title.textContent = "FX rates";

    const chips = document.createElement("div");
    chips.textContent = "Status is Open";

    const grid = document.createElement("div");
    grid.setAttribute("role", "grid");
    grid.style.marginLeft = "-32px";
    grid.style.width = "320px";

    const header = document.createElement("div");
    header.setAttribute("role", "row");
    header.setAttribute("aria-rowindex", "1");
    header.className = "sticky top-0 z-20 flex bg-background";
    header.textContent = "Currency";

    const rowgroup = document.createElement("div");
    rowgroup.setAttribute("role", "rowgroup");
    rowgroup.style.height = "400px";

    const bodyRow = document.createElement("div");
    bodyRow.setAttribute("role", "row");
    bodyRow.className = "absolute top-0 left-0 flex w-full";
    bodyRow.style.transform = "translateY(36px)";
    bodyRow.style.minHeight = "36px";
    bodyRow.textContent = "CAD";

    const openPill = document.createElement("button");
    openPill.className = "hover-reveal";
    openPill.textContent = "Open";
    bodyRow.appendChild(openPill);

    rowgroup.appendChild(bodyRow);
    grid.appendChild(header);
    grid.appendChild(rowgroup);
    block.appendChild(title);
    block.appendChild(chips);
    block.appendChild(grid);
    content.appendChild(block);
    shell.appendChild(content);
    document.body.appendChild(shell);

    const preview = resolveCanvasRowDragPreviewSource("db-1")?.node;
    expect(preview).not.toBeUndefined();
    expect(preview?.hasAttribute("data-database-drag-preview")).toBe(true);
    expect(preview?.isConnected).toBe(false);
    expect(preview?.textContent).toContain("FX rates");
    expect(preview?.textContent).toContain("Status is Open");
    expect(preview?.textContent).toContain("Currency");
    expect(preview?.textContent).toContain("CAD");
    expect(preview?.querySelector(".hover-reveal")).toBeNull();
    expect(
      (preview?.querySelector('[role="grid"]') as HTMLElement).style.marginLeft
    ).toBe("0px");

    const clonedBody = preview?.querySelector('[role="rowgroup"] [role="row"]');
    expect(clonedBody).not.toBeNull();
    expect(clonedBody?.classList.contains("absolute")).toBe(false);
    expect((clonedBody as HTMLElement).style.transform).toBe("none");
  });

  it("anchors the database card on the live block, inset by the card padding", () => {
    const shell = document.createElement("div");
    shell.setAttribute("data-canvas-row-id", "db-2");
    const block = document.createElement("div");
    block.setAttribute("data-database-block", "");
    block.getBoundingClientRect = () =>
      ({ left: 200, top: 120, width: 640, height: 900 }) as DOMRect;
    shell.appendChild(block);
    document.body.appendChild(shell);

    const source = resolveCanvasRowDragPreviewSource("db-2");
    expect(source?.origin).toEqual({ left: 192, top: 112 });
    // Card grows by its padding so the clone renders at the block's real width.
    expect((source?.node as HTMLElement).style.width).toBe("656px");
  });

  it("falls back to a table row element", () => {
    const row = document.createElement("tr");
    row.setAttribute("data-table-row-id", "row-2");
    document.body.appendChild(row);

    expect(resolveCanvasRowDragPreviewSource("row-2")?.node).toBe(row);
  });
});
