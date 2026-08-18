/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseEdit } from "@/components/blocks/types/database/database-edit.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

// The create-flow popover resolves its presentation from the device-layout
// context; stub it so the test needs no provider scaffolding.
vi.mock("@/components/layout/device-layout-provider.tsx", async (orig) => ({
  ...(await orig<object>()),
  useIsCoarsePrimaryPointer: () => false,
}));
// The gate is open (client + shipped seeding settled), which is the state that
// used to trigger the destructive orphan cleanup.
vi.mock("@/components/blocks/types/database/database-block-gate.tsx", () => ({
  DatabaseBlockLoading: () => null,
  useDatabaseBlockReady: () => true,
}));
// No definition for the linked id: the database was deleted before the delete
// cascade existed, or a shipped page references a database with no document.
vi.mock("@/db/queries/use-database.ts", () => ({
  useDatabase: () => undefined,
}));
vi.mock("@/components/database/database-table-view.tsx", () => ({
  DatabaseTableView: () => <div data-testid="table-view" />,
}));

// Re-adding any canvas dispatch here should fail loudly: this component renders
// on an ordinary page visit, so touching the block tree from it silently
// rewrites the reader's copy of the page.
const dispatch = vi.fn();
vi.mock("@/components/canvas/canvas-editor-context.tsx", () => ({
  useCanvasEditorContext: () => ({ dispatch }),
}));

const row = { rowId: "row-1" } as CanvasRow;

afterEach(() => {
  cleanup();
  dispatch.mockClear();
});

describe("DatabaseEdit with a missing database", () => {
  it("renders an unavailable shell instead of deleting the block", () => {
    render(
      <DatabaseEdit
        onChange={vi.fn()}
        props={{ databaseId: "db-gone" }}
        row={row}
      />
    );

    expect(screen.getByText("This database is unavailable.")).toBeTruthy();
    expect(screen.queryByTestId("table-view")).toBeNull();
  });

  it("never dispatches a canvas mutation", () => {
    render(
      <DatabaseEdit
        onChange={vi.fn()}
        props={{ databaseId: "db-gone" }}
        row={row}
      />
    );

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still offers the create flow for an unlinked block", () => {
    render(
      <DatabaseEdit onChange={vi.fn()} props={{ databaseId: "" }} row={row} />
    );

    expect(screen.getByText("New, linked, or synced table")).toBeTruthy();
    expect(screen.queryByText("This database is unavailable.")).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
