/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseTableView } from "@/components/database/database-table-view.tsx";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * View-pipeline tests for the ADVANCED filter (P5.4): rows the boolean
 * formula rejects disappear from the grid, the hidden-rows notice counts
 * them exactly like structured-filter hides, and an unparseable saved
 * expression disables the filter (nothing hidden). The heavy leaf surfaces
 * (virtualized grid, title menus) are stubbed — this exercises the real
 * filter → sort pipeline in `DatabaseTableView`, not their rendering.
 */

vi.mock("@/hooks/device-layout.ts", () => ({
  useIsCoarsePrimaryPointer: () => false,
}));

// The virtualized grid needs real layout; the pipeline test only needs to
// see WHICH rows reached it.
vi.mock("@/components/database/database-table-grid.tsx", () => ({
  DatabaseTableGrid: ({ rows }: { rows: readonly LocalDatabaseRow[] }) => (
    <div data-testid="grid">
      {rows.map((row) => (
        <div key={row.id}>{String(row.values["f-title"] ?? "")}</div>
      ))}
    </div>
  ),
}));

// Title row (menus, icons) and view switcher are out of scope.
vi.mock("@/components/database/database-title.tsx", () => ({
  DatabaseTitle: () => <div data-testid="title" />,
}));
vi.mock("@/components/database/database-view-switcher.tsx", () => ({
  DatabaseViewSwitcher: () => null,
}));

vi.mock("@/db/sync/database-sync-engine.ts", () => ({
  watchDatabaseSync: () => () => undefined,
}));
vi.mock("@/db/formula-engine.ts", () => ({
  useFormulaOverlay: () => new Map(),
}));
vi.mock("@/db/queries/use-formula-functions.ts", () => ({
  useFormulaUserFunctions: () => new Map(),
}));
vi.mock("@/lib/databases/formula-relations.ts", () => ({
  localFormulaRelationResolver: () => ({ database: () => null }),
}));
vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  updateDatabaseView: vi.fn(),
}));

const database = vi.hoisted(() => ({ current: null as LocalDatabase | null }));
const dbRows = vi.hoisted(() => ({ current: [] as LocalDatabaseRow[] }));
vi.mock("@/db/queries/use-database.ts", () => ({
  useDatabase: () => database.current ?? undefined,
  useDatabaseRows: () => dbRows.current,
  useAllDatabases: () => (database.current ? [database.current] : []),
}));

function makeRow(
  id: string,
  title: string,
  estimate: number
): LocalDatabaseRow {
  return {
    id,
    databaseId: "db-1",
    values: { "f-title": title, "f-est": estimate },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function seed(expression?: string): void {
  database.current = {
    id: "db-1",
    name: "Tasks",
    primaryFieldId: "f-title",
    fields: [
      { id: "f-title", name: "Name", type: "text" },
      { id: "f-est", name: "Estimate", type: "number" },
    ],
    views: [
      {
        id: "v-1",
        name: "All",
        type: "table",
        ...(expression === undefined ? {} : { advancedFilter: { expression } }),
        config: {},
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  dbRows.current = [
    makeRow("row-1", "Apollo", 5),
    makeRow("row-2", "Borealis", 2),
    makeRow("row-3", "Calypso", 8),
  ];
}

const HIDDEN_NOTICE = /hidden by view options/;
const IGNORED_TITLE = /Advanced filter is ignored/;

afterEach(cleanup);

describe("DatabaseTableView advanced filter", () => {
  it("hides rows failing the formula and counts them in the notice", () => {
    seed('prop("f-est") > 3');
    render(<DatabaseTableView databaseId="db-1" mode="edit" />);
    expect(screen.getByText("Apollo")).toBeDefined();
    expect(screen.getByText("Calypso")).toBeDefined();
    expect(screen.queryByText("Borealis")).toBeNull();
    expect(screen.getByText("1 row hidden by view options")).toBeDefined();
  });

  it("shows every row and no notice without an advanced filter", () => {
    seed();
    render(<DatabaseTableView databaseId="db-1" mode="edit" />);
    expect(screen.getByText("Borealis")).toBeDefined();
    expect(screen.queryByText(HIDDEN_NOTICE)).toBeNull();
  });

  it("ignores an unparseable saved expression (nothing hidden, chip broken)", () => {
    seed("1 +");
    render(<DatabaseTableView databaseId="db-1" mode="edit" />);
    expect(screen.getByText("Apollo")).toBeDefined();
    expect(screen.getByText("Borealis")).toBeDefined();
    expect(screen.getByText("Calypso")).toBeDefined();
    expect(screen.queryByText(HIDDEN_NOTICE)).toBeNull();
    // The filter bar's advanced chip carries the broken-state title.
    const broken = document.querySelector('[title^="Advanced filter"]');
    expect(broken?.getAttribute("title")).toMatch(IGNORED_TITLE);
  });
});
