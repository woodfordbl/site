/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseCellInlineEditor } from "@/components/database/database-cell-editor.tsx";
import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const updateDatabaseCell = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  updateDatabaseCell,
  updateDatabaseField: vi.fn(),
}));

// Only the select editor's "create option" path reads the collection; stub it
// so the module imports without booting the local DB.
vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabaseRowsCollection: { get: () => undefined },
}));

// Fine pointer keeps the popover presentation (the drawer path needs vaul +
// DeviceLayoutProvider scaffolding this test doesn't exercise).
vi.mock("@/hooks/device-layout.ts", () => ({
  useIsCoarsePrimaryPointer: () => false,
}));

const TARGET_DATABASE: LocalDatabase = {
  id: "db-target",
  name: "Projects",
  primaryFieldId: "f-title",
  fields: [{ id: "f-title", name: "Name", type: "text" }],
  views: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function targetRow(
  id: string,
  title: string,
  order?: number
): LocalDatabaseRow {
  return {
    id,
    databaseId: "db-target",
    values: { "f-title": title },
    order,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// Deliberately out of manual order (and one synced-style row without a
// page): the editor must sort by `compareManualOrder` and list every row.
const TARGET_ROWS = [
  targetRow("row-b", "Borealis", 2),
  targetRow("row-a", "Apollo", 1),
  { ...targetRow("row-c", "Calypso", 3), pageId: null },
];

vi.mock("@/db/queries/use-database.ts", () => ({
  useDatabase: (databaseId: string) =>
    databaseId === "db-target" ? TARGET_DATABASE : undefined,
  useDatabaseRows: (databaseId: string) =>
    databaseId === "db-target" ? TARGET_ROWS : [],
}));

const RELATION_FIELD: DatabaseField = {
  id: "f-rel",
  name: "Projects",
  type: "relation",
  targetDatabaseId: "db-target",
};

const ROW_ID = "row-1";

function renderEditor(value?: string[]) {
  const onStopEdit = vi.fn();
  render(
    <DatabaseCellInlineEditor
      field={RELATION_FIELD}
      onNavigate={vi.fn()}
      onStopEdit={onStopEdit}
      rowId={ROW_ID}
      value={value}
    />
  );
  return { onStopEdit };
}

beforeEach(() => {
  updateDatabaseCell.mockClear();
  // Base UI's positioner observes size; jsdom lacks ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        /* no-op */
      }
      unobserve() {
        /* no-op */
      }
      disconnect() {
        /* no-op */
      }
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RelationCellPopoverEditor", () => {
  it("lists every target row in manual order", () => {
    renderEditor();
    const titles = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(titles).toEqual(["Apollo", "Borealis", "Calypso"]);
  });

  it("links a row on toggle", () => {
    renderEditor();
    fireEvent.click(screen.getByText("Borealis"));
    expect(updateDatabaseCell).toHaveBeenCalledWith(ROW_ID, "f-rel", ["row-b"]);
  });

  it("appends to the existing links and stays open", () => {
    const { onStopEdit } = renderEditor(["row-a"]);
    fireEvent.click(screen.getByText("Calypso"));
    expect(updateDatabaseCell).toHaveBeenCalledWith(ROW_ID, "f-rel", [
      "row-a",
      "row-c",
    ]);
    expect(onStopEdit).not.toHaveBeenCalled();
  });

  it("unlinks a linked row, writing null when nothing remains", () => {
    renderEditor(["row-a"]);
    fireEvent.click(screen.getByText("Apollo"));
    expect(updateDatabaseCell).toHaveBeenCalledWith(ROW_ID, "f-rel", null);
  });

  it("filters rows by title text", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Search rows"), {
      target: { value: "cal" },
    });
    expect(screen.getByText("Calypso")).toBeDefined();
    expect(screen.queryByText("Apollo")).toBeNull();
  });

  it("toggles the first filtered row on Enter", () => {
    renderEditor();
    const search = screen.getByLabelText("Search rows");
    fireEvent.change(search, { target: { value: "bor" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(updateDatabaseCell).toHaveBeenCalledWith(ROW_ID, "f-rel", ["row-b"]);
  });
});
