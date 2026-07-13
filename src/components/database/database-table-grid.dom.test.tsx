/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DatabaseTableGrid } from "@/components/database/database-table-grid.tsx";
import { groupRowsForView } from "@/lib/databases/row-group.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseView,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Grid-level tests for per-group aggregates (P5.5): a grouped view with
 * `view.config.calculations` renders each group's OWN aggregate values
 * inside its header band (collapsed groups included — their rows disappear,
 * the header summary stays), while the footer Calculate row keeps
 * aggregating over the whole filtered row set. Formula list cells (merged
 * display-string arrays) flatten into numeric aggregates. Heavy interactive
 * leaves (menus, editors, DnD) are stubbed — the real grid layout, grouping
 * flatten, and aggregate math run.
 */

vi.mock("@/components/database/database-add-row.tsx", () => ({
  DatabaseAddRow: () => null,
}));
vi.mock("@/components/database/database-cell.tsx", () => ({
  DatabaseCellValueView: ({ value }: { value?: DatabaseCellValue }) => (
    <span>{Array.isArray(value) ? value.join("|") : String(value ?? "")}</span>
  ),
}));
vi.mock("@/components/database/database-cell-editor.tsx", () => ({
  DatabaseCellInlineEditor: () => null,
  DatabaseCheckboxCellEditor: () => null,
}));
vi.mock("@/components/database/database-column-dnd.tsx", () => ({
  DATABASE_COLUMN_DRAG_ATTRIBUTE: "data-column-drag",
  DatabaseColumnDnd: ({ children }: { children: ReactNode }) => children,
  DatabaseColumnDragAutoScroll: () => null,
  DatabaseColumnDropIndicator: () => null,
  DatabaseColumnDropZone: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/database/database-column-menu.tsx", () => ({
  DatabaseColumnMenu: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));
vi.mock("@/components/database/database-column-resize-zone.tsx", () => ({
  DatabaseColumnResizeZone: () => null,
}));
vi.mock("@/components/database/database-group-menu.tsx", () => ({
  DatabaseGroupMenu: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/database/database-row-menu.tsx", () => ({
  DatabaseRowMenu: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/database/database-select-column-peek.tsx", () => ({
  SelectColumnPeekLayer: () => null,
}));
vi.mock("@/components/database/use-database-column-drag.ts", () => ({
  useDatabaseColumnHeaderDrag: () => ({
    headerProps: {},
    isDragging: false,
    showGrabbing: false,
  }),
}));
vi.mock("@/components/database/use-database-column-resize.ts", () => ({
  useDatabaseColumnResize: () => ({
    liveWidths: undefined,
    startResize: () => undefined,
  }),
}));
vi.mock("@/components/database/use-database-path-target.ts", () => ({
  useDatabasePathTargets: () => ({ hub: null, row: null, template: null }),
}));
vi.mock("@/components/pages/page-icon-display.tsx", () => ({
  PageIconDisplay: () => null,
}));
vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  addDatabaseField: vi.fn(),
  insertDatabaseRow: vi.fn(),
  updateDatabaseCell: vi.fn(),
  updateDatabaseView: vi.fn(),
}));
vi.mock("@/lib/toast/app-toast.ts", () => ({
  appToast: { info: vi.fn() },
}));

beforeAll(() => {
  // jsdom lacks ResizeObserver (scrollport width probe + bleed metrics).
  window.ResizeObserver = class {
    observe(): void {
      return;
    }
    unobserve(): void {
      return;
    }
    disconnect(): void {
      return;
    }
  } as unknown as typeof ResizeObserver;
  // jsdom has no layout: give TanStack Virtual a real scrollport rect
  // (`getRect` reads offsetWidth/offsetHeight) so it renders the flattened
  // header+row items — all fixtures fit in one 600px window.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 800,
  });
  Element.prototype.getBoundingClientRect = () =>
    ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      x: 0,
      y: 0,
      toJSON: () => "",
    }) as DOMRect;
});

afterEach(cleanup);

const fields: DatabaseField[] = [
  { id: "f-title", name: "Name", type: "text" },
  {
    id: "f-status",
    name: "Status",
    type: "select",
    options: [
      { id: "opt-a", name: "Alpha" },
      { id: "opt-b", name: "Beta" },
    ],
  },
  { id: "f-points", name: "Points", type: "number" },
  { id: "f-roll", name: "Rollup", type: "formula", expression: 'prop("x")' },
];

function makeRow(
  id: string,
  values: Record<string, DatabaseCellValue>
): LocalDatabaseRow {
  return {
    id,
    databaseId: "db-1",
    values,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

// Formula cells arrive MERGED: list results are display-string arrays.
const rows = [
  makeRow("r1", {
    "f-title": "Astra",
    "f-status": "opt-a",
    "f-points": 1,
    "f-roll": ["1", "2"],
  }),
  makeRow("r2", {
    "f-title": "Aurora",
    "f-status": "opt-a",
    "f-points": 2,
    "f-roll": 4,
  }),
  makeRow("r3", {
    "f-title": "Bravo",
    "f-status": "opt-b",
    "f-points": 5,
    "f-roll": ["10", "x"],
  }),
];

function makeView(overrides?: Partial<DatabaseView>): DatabaseView {
  return {
    id: "v-1",
    name: "All",
    type: "table",
    groupBy: { fieldId: "f-status" },
    config: {
      calculations: { "f-points": "sum", "f-roll": "sum" },
      collapsedGroupKeys: ["opt-b"],
    },
    ...overrides,
  };
}

function renderGrid(view: DatabaseView, grouped: boolean): void {
  render(
    <DatabaseTableGrid
      columns={fields}
      databaseId="db-1"
      groups={grouped ? groupRowsForView(rows, fields, view) : null}
      mode="view"
      now={new Date("2026-07-13T12:00:00.000Z")}
      pinnedFields={[]}
      primaryFieldId="f-title"
      rows={rows}
      view={view}
    />
  );
}

describe("DatabaseTableGrid per-group aggregates", () => {
  it("renders each group's own aggregates inside its header band", () => {
    renderGrid(makeView(), true);
    const overlays = screen.getAllByTestId("group-aggregates");
    expect(overlays).toHaveLength(2);
    // Alpha (r1 + r2): points 1+2, rollup lists/scalars flatten 1+2+4.
    expect(within(overlays[0]).getByText("3")).toBeDefined();
    expect(within(overlays[0]).getByText("7")).toBeDefined();
    // Beta (r3): points 5, rollup ["10","x"] flattens to 10.
    expect(within(overlays[1]).getByText("5")).toBeDefined();
    expect(within(overlays[1]).getByText("10")).toBeDefined();
  });

  it("keeps a collapsed group's header aggregate while hiding its rows", () => {
    renderGrid(makeView(), true);
    // Beta is collapsed: its data row never renders…
    expect(screen.queryByText("Bravo")).toBeNull();
    expect(screen.getByText("Astra")).toBeDefined();
    // …but its header still shows the group summary.
    const overlays = screen.getAllByTestId("group-aggregates");
    expect(within(overlays[1]).getByText("5")).toBeDefined();
  });

  it("keeps the footer Calculate row aggregating over ALL rows", () => {
    renderGrid(makeView(), true);
    // Whole-table sums include the collapsed group: 1+2+5 and 1+2+4+10.
    expect(screen.getByText("8")).toBeDefined();
    expect(screen.getByText("17")).toBeDefined();
    // Two per-group overlays x two columns + the footer's two cells.
    expect(screen.getAllByText("Sum")).toHaveLength(6);
  });

  it("renders no group aggregate layer on ungrouped views", () => {
    renderGrid(makeView({ groupBy: undefined }), false);
    expect(screen.queryAllByTestId("group-aggregates")).toHaveLength(0);
    // The footer still renders its whole-table aggregates.
    expect(screen.getAllByText("Sum")).toHaveLength(2);
    expect(screen.getByText("8")).toBeDefined();
    expect(screen.getByText("17")).toBeDefined();
  });
});
