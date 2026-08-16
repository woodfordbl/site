// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { collectTableColumnDropRects } from "@/lib/dnd/collect-table-column-rects.ts";

function mountCell(
  row: HTMLTableRowElement,
  columnIndex: number,
  rect: DOMRect
): HTMLTableCellElement {
  const cell = document.createElement("td");
  cell.setAttribute("data-table-column-index", String(columnIndex));
  cell.getBoundingClientRect = () => rect;
  row.appendChild(cell);
  return cell;
}

describe("collectTableColumnDropRects", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("merges all cells in a column and spans full table height", () => {
    const layout = document.createElement("div");
    layout.setAttribute("data-table-layout", "");
    layout.setAttribute("data-table-id", "t1");

    const table = document.createElement("table");
    table.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        bottom: 120,
        right: 300,
        width: 300,
        height: 120,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const headerRow = document.createElement("tr");
    mountCell(headerRow, 0, {
      top: 0,
      left: 0,
      bottom: 30,
      right: 100,
      width: 100,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    mountCell(headerRow, 1, {
      top: 0,
      left: 100,
      bottom: 30,
      right: 200,
      width: 100,
      height: 30,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    table.appendChild(headerRow);

    const bodyRow = document.createElement("tr");
    mountCell(bodyRow, 0, {
      top: 30,
      left: 0,
      bottom: 120,
      right: 100,
      width: 100,
      height: 90,
      x: 0,
      y: 30,
      toJSON: () => ({}),
    } as DOMRect);
    mountCell(bodyRow, 1, {
      top: 30,
      left: 100,
      bottom: 120,
      right: 200,
      width: 100,
      height: 90,
      x: 100,
      y: 30,
      toJSON: () => ({}),
    } as DOMRect);
    table.appendChild(bodyRow);

    layout.appendChild(table);
    document.body.appendChild(layout);

    const rects = collectTableColumnDropRects();
    const columnZero = rects.get("t1:0");
    const columnOne = rects.get("t1:1");

    expect(columnZero).toMatchObject({
      top: 0,
      bottom: 120,
      left: 0,
      right: 100,
    });
    expect(columnOne).toMatchObject({
      top: 0,
      bottom: 120,
      left: 100,
      right: 200,
    });
  });
});
