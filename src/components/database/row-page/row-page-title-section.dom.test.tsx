/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RowPageTitleSection } from "@/components/database/row-page/row-page-title-section.tsx";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const mocks = vi.hoisted(() => ({
  setDatabaseRowIcon: vi.fn(),
  updateDatabaseCell: vi.fn(),
}));

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  setDatabaseRowIcon: mocks.setDatabaseRowIcon,
  updateDatabaseCell: mocks.updateDatabaseCell,
}));

vi.mock("@/components/pages/glyph-icon-picker.tsx", () => ({
  GlyphIconPicker: ({ onSelect }: { onSelect: (icon: string) => void }) => (
    <button
      onClick={() => {
        onSelect("tabler:star");
      }}
      type="button"
    >
      Pick icon
    </button>
  ),
}));

vi.mock("@/components/database/row-page/row-properties-panel.tsx", () => ({
  RowPropertiesPanel: () => <div>Properties</div>,
}));

const DATABASE: LocalDatabase = {
  id: "db-1",
  name: "Tasks",
  primaryFieldId: "f-title",
  fields: [{ id: "f-title", name: "Name", type: "text" }],
  views: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ROW: LocalDatabaseRow = {
  id: "row-1",
  databaseId: DATABASE.id,
  values: { "f-title": "Draft task" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("RowPageTitleSection", () => {
  it("writes name and icon edits to the selected row", () => {
    render(
      <RowPageTitleSection database={DATABASE} icon="tabler:file" row={ROW} />
    );

    const name = screen.getByRole("textbox", { name: "Row name" });
    fireEvent.change(name, { target: { value: "Updated task" } });
    fireEvent.blur(name);
    fireEvent.click(screen.getByRole("button", { name: "Pick icon" }));

    expect(mocks.updateDatabaseCell).toHaveBeenCalledWith(
      ROW.id,
      DATABASE.primaryFieldId,
      "Updated task"
    );
    expect(mocks.setDatabaseRowIcon).toHaveBeenCalledWith(
      ROW.id,
      "tabler:star"
    );
  });
});
