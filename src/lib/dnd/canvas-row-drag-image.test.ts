// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  flattenDatabaseGridClone,
  resolveCanvasRowDragPreviewNode,
  sanitizeDatabaseGridClone,
} from "@/lib/dnd/canvas-row-drag-image.ts";

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

    expect(resolveCanvasRowDragPreviewNode("table-1")).toBe(table);
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
    grid.className = "-ml-12";
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

    const preview = resolveCanvasRowDragPreviewNode("db-1");
    expect(preview).not.toBeNull();
    expect(preview?.hasAttribute("data-database-drag-preview")).toBe(true);
    expect(preview?.isConnected).toBe(false);
    expect(preview?.textContent).toContain("FX rates");
    expect(preview?.textContent).toContain("Status is Open");
    expect(preview?.textContent).toContain("Currency");
    expect(preview?.textContent).toContain("CAD");
    expect(preview?.querySelector(".hover-reveal")).toBeNull();
    expect(preview?.querySelector(".-ml-12")).toBeNull();

    const clonedBody = preview?.querySelector('[role="rowgroup"] [role="row"]');
    expect(clonedBody).not.toBeNull();
    expect(clonedBody?.classList.contains("absolute")).toBe(false);
    expect((clonedBody as HTMLElement).style.transform).toBe("none");
  });

  it("falls back to a table row element", () => {
    const row = document.createElement("tr");
    row.setAttribute("data-table-row-id", "row-2");
    document.body.appendChild(row);

    expect(resolveCanvasRowDragPreviewNode("row-2")).toBe(row);
  });
});

describe("sanitizeDatabaseGridClone", () => {
  it("flattens sticky headers and absolute body rows", () => {
    const grid = document.createElement("div");
    grid.setAttribute("role", "grid");

    const header = document.createElement("div");
    header.setAttribute("role", "row");
    header.className = "sticky top-0 z-20";
    grid.appendChild(header);

    const rowgroup = document.createElement("div");
    rowgroup.setAttribute("role", "rowgroup");
    rowgroup.style.height = "200px";

    const body = document.createElement("div");
    body.setAttribute("role", "row");
    body.className = "absolute top-0 left-0";
    body.style.transform = "translateY(0px)";
    rowgroup.appendChild(body);
    grid.appendChild(rowgroup);

    const shadow = document.createElement("div");
    shadow.className = "database-grid-pinned-shadow";
    grid.appendChild(shadow);

    document.body.appendChild(grid);

    const card = sanitizeDatabaseGridClone(grid);
    expect(card.hasAttribute("data-database-drag-preview")).toBe(true);
    expect(card.querySelector(".database-grid-pinned-shadow")).toBeNull();

    const headerClone = card.querySelector('[role="row"].sticky, [role="row"]');
    expect(headerClone?.classList.contains("sticky")).toBe(false);

    const bodyClone = card.querySelector('[role="rowgroup"] [role="row"]');
    expect(bodyClone?.classList.contains("absolute")).toBe(false);
    expect((bodyClone as HTMLElement).style.position).toBe("relative");
    expect((bodyClone as HTMLElement).style.transform).toBe("none");

    const group = card.querySelector('[role="rowgroup"]') as HTMLElement;
    expect(group.style.height).toBe("auto");
  });
});

describe("flattenDatabaseGridClone", () => {
  it("mutates a grid clone in place", () => {
    const grid = document.createElement("div");
    grid.setAttribute("role", "grid");
    const row = document.createElement("div");
    row.setAttribute("role", "row");
    row.className = "absolute top-0 left-0";
    row.style.transform = "translateY(10px)";
    grid.appendChild(row);

    flattenDatabaseGridClone(grid);
    expect(row.classList.contains("absolute")).toBe(false);
    expect(row.style.transform).toBe("none");
  });
});
