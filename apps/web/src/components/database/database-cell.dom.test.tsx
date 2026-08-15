/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CELL_VALUE_TRUNCATE_CLASS,
  DatabaseCellValueView,
} from "@/components/database/database-cell.tsx";
import type { DatabaseField } from "@/lib/schemas/database.ts";

const TEXT_FIELD: DatabaseField = { id: "f-note", name: "Note", type: "text" };
const NUMBER_FIELD: DatabaseField = {
  id: "f-price",
  name: "Price",
  type: "number",
  format: "currency",
  currencyCode: "USD",
};
const URL_FIELD: DatabaseField = { id: "f-url", name: "Link", type: "url" };
const DATE_FIELD: DatabaseField = { id: "f-date", name: "Date", type: "date" };
const SELECT_FIELD: DatabaseField = {
  id: "f-status",
  name: "Status",
  type: "select",
  options: [
    {
      id: "opt-long",
      name: "A very long select option that should ellipsize",
    },
  ],
};
const MULTI_SELECT_FIELD: DatabaseField = {
  id: "f-tags",
  name: "Tags",
  type: "multiSelect",
  options: [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta with a long label" },
    { id: "c", name: "Gamma" },
  ],
};

const LONG_TEXT = "Long text that overflows a narrow column";
const LONG_URL = "https://example.com/very/long/path";
const EDIT_URL = "https://example.com/edit-path";
const SELECT_OPTION_NAME = "A very long select option that should ellipsize";
const TRUNCATE_TOKENS = CELL_VALUE_TRUNCATE_CLASS.split(" ");

/**
 * Mimics a constrained grid cell: fixed width + flex so missing `min-w-0` on
 * the value would prevent ellipsis (the historical bug).
 */
function renderInNarrowCell(node: ReactNode) {
  return render(
    <div
      className="relative flex shrink-0 items-center overflow-hidden"
      data-testid="narrow-cell"
      style={{ width: 96 }}
    >
      <span className="min-w-0 max-w-full">{node}</span>
    </div>
  );
}

afterEach(() => {
  cleanup();
});

describe("DatabaseCellValueView truncation", () => {
  it("applies truncate classes to text, number, url, and date display values", () => {
    renderInNarrowCell(
      <DatabaseCellValueView field={TEXT_FIELD} mode="view" value={LONG_TEXT} />
    );
    const textEl = screen.getByText(LONG_TEXT);
    for (const token of TRUNCATE_TOKENS) {
      expect(textEl.classList.contains(token)).toBe(true);
    }
    cleanup();

    renderInNarrowCell(
      <DatabaseCellValueView
        field={NUMBER_FIELD}
        mode="view"
        value={12_345_678.9}
      />
    );
    const numberEl = screen.getByText("$12,345,678.90");
    for (const token of TRUNCATE_TOKENS) {
      expect(numberEl.classList.contains(token)).toBe(true);
    }
    cleanup();

    renderInNarrowCell(
      <DatabaseCellValueView field={URL_FIELD} mode="view" value={LONG_URL} />
    );
    const linkEl = screen.getByRole("link", { name: LONG_URL });
    for (const token of TRUNCATE_TOKENS) {
      expect(linkEl.classList.contains(token)).toBe(true);
    }
    cleanup();

    renderInNarrowCell(
      <DatabaseCellValueView
        field={DATE_FIELD}
        mode="view"
        value="2024-06-15"
      />
    );
    const dateEl = screen.getByText("Jun 15, 2024");
    for (const token of TRUNCATE_TOKENS) {
      expect(dateEl.classList.contains(token)).toBe(true);
    }
  });

  it("caps select pills and clips multi-select rows without distorting badges", () => {
    renderInNarrowCell(
      <DatabaseCellValueView
        field={SELECT_FIELD}
        mode="edit"
        value="opt-long"
      />
    );
    const name = screen.getByText(SELECT_OPTION_NAME);
    const pill = name.parentElement;
    expect(pill?.classList.contains("max-w-full")).toBe(true);
    expect(pill?.classList.contains("overflow-hidden")).toBe(true);
    expect(pill?.classList.contains("shrink-0")).toBe(true);
    expect(name.classList.contains("min-w-0")).toBe(true);
    expect(name.classList.contains("truncate")).toBe(true);

    cleanup();
    renderInNarrowCell(
      <DatabaseCellValueView
        field={MULTI_SELECT_FIELD}
        mode="edit"
        value={["a", "b", "c"]}
      />
    );
    const row = screen.getByText("Alpha").parentElement?.parentElement;
    expect(row?.classList.contains("min-w-0")).toBe(true);
    expect(row?.classList.contains("max-w-full")).toBe(true);
    expect(row?.classList.contains("overflow-hidden")).toBe(true);
  });

  it("keeps edit-mode url display truncatable while leaving editors out of the truncate wrapper", () => {
    renderInNarrowCell(
      <DatabaseCellValueView field={URL_FIELD} mode="edit" value={EDIT_URL} />
    );
    const display = screen.getByText(EDIT_URL);
    for (const token of TRUNCATE_TOKENS) {
      expect(display.classList.contains(token)).toBe(true);
    }
    // Display path only — the grid mounts DatabaseCellInlineEditor as a
    // sibling overlay with `width={column.width}`, not inside this truncate
    // wrapper.
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
