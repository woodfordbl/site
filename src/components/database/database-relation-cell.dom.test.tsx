/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseCellValueView } from "@/components/database/database-cell.tsx";
import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const TARGET_DATABASE: LocalDatabase = {
  id: "db-target",
  name: "Projects",
  primaryFieldId: "f-title",
  fields: [{ id: "f-title", name: "Name", type: "text" }],
  views: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function targetRow(id: string, title: string): LocalDatabaseRow {
  return {
    id,
    databaseId: "db-target",
    values: { "f-title": title },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const TARGET_ROWS = [
  targetRow("row-a", "Apollo"),
  targetRow("row-b", "Borealis"),
  targetRow("row-c", "Calypso"),
  targetRow("row-d", "Drift"),
  // Blank title — must render as "Untitled", not an empty chip.
  targetRow("row-e", ""),
];

// RelationCellView reads the target schema and rows through these hooks; the
// mock keeps the test free of the local DB (same pattern as sibling dom
// tests stubbing the collection layer).
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

afterEach(cleanup);

describe("RelationCellView", () => {
  it("renders one chip per linked row, titled by the target's primary field", () => {
    render(
      <DatabaseCellValueView
        field={RELATION_FIELD}
        mode="view"
        value={["row-a", "row-b"]}
      />
    );
    expect(screen.getByText("Apollo")).toBeDefined();
    expect(screen.getByText("Borealis")).toBeDefined();
  });

  it("skips ids that resolve to no target row", () => {
    const { container } = render(
      <DatabaseCellValueView
        field={RELATION_FIELD}
        mode="view"
        value={["row-gone", "row-a"]}
      />
    );
    expect(screen.getByText("Apollo")).toBeDefined();
    expect(container.textContent).not.toContain("row-gone");
    // Only the resolved chip renders — the stale id contributes nothing.
    expect(screen.queryByText("+1")).toBeNull();
  });

  it("labels blank target titles as Untitled", () => {
    render(
      <DatabaseCellValueView
        field={RELATION_FIELD}
        mode="view"
        value={["row-e"]}
      />
    );
    expect(screen.getByText("Untitled")).toBeDefined();
  });

  it("collapses past three chips into a +n overflow marker", () => {
    render(
      <DatabaseCellValueView
        field={RELATION_FIELD}
        mode="view"
        value={["row-a", "row-b", "row-c", "row-d", "row-e"]}
      />
    );
    expect(screen.getByText("Apollo")).toBeDefined();
    expect(screen.getByText("Borealis")).toBeDefined();
    expect(screen.getByText("Calypso")).toBeDefined();
    expect(screen.queryByText("Drift")).toBeNull();
    expect(screen.getByText("+2")).toBeDefined();
  });

  it("renders nothing for an empty cell", () => {
    const { container } = render(
      <DatabaseCellValueView field={RELATION_FIELD} mode="view" value={null} />
    );
    expect(container.textContent).toBe("");
  });
});
