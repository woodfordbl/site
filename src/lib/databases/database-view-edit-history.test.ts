import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAllDatabaseViewEditHistories,
  getLastDatabaseViewEditRecordedAt,
  getLastSessionUndoKind,
  popDatabaseViewRedoEntry,
  popDatabaseViewUndoEntry,
  recordDatabaseViewEditHistory,
  tryRedoDatabaseViewEdit,
  tryUndoDatabaseViewEdit,
} from "@/lib/databases/database-view-edit-history.ts";
import type { DatabaseView } from "@/lib/schemas/database.ts";

const restoreDatabaseView = vi.hoisted(() => vi.fn());

vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabasesCollection: {
    get: vi.fn(),
  },
}));

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  restoreDatabaseView,
}));

import { localDatabasesCollection } from "@/db/collections/local-collections.ts";

const DATABASE_ID = "db-1";
const VIEW_ID = "view-1";

function view(overrides: Partial<DatabaseView> = {}): DatabaseView {
  return {
    id: VIEW_ID,
    name: "Table",
    type: "table",
    config: {},
    filter: {
      op: "and",
      conditions: [
        {
          id: "cond-1",
          fieldId: "title",
          operator: "contains",
          value: "CAD",
        },
      ],
    },
    ...overrides,
  };
}

afterEach(() => {
  clearAllDatabaseViewEditHistories();
  restoreDatabaseView.mockReset();
  vi.mocked(localDatabasesCollection.get).mockReset();
});

describe("recordDatabaseViewEditHistory / popDatabaseViewUndoEntry", () => {
  it("undoes back through recorded before-states", () => {
    const before = view();
    const after = view({ filter: undefined });

    recordDatabaseViewEditHistory(DATABASE_ID, before, { nowMs: 0 });
    const restored = popDatabaseViewUndoEntry(
      `${DATABASE_ID}:${VIEW_ID}`,
      after
    );

    expect(restored).toEqual(before);
    expect(getLastDatabaseViewEditRecordedAt()).toBe(0);
  });

  it("round-trips redo after undo", () => {
    const before = view();
    const cleared = view({ filter: undefined });

    recordDatabaseViewEditHistory(DATABASE_ID, before, { nowMs: 0 });
    const restored = popDatabaseViewUndoEntry(
      `${DATABASE_ID}:${VIEW_ID}`,
      cleared
    );
    expect(restored).toEqual(before);

    const replayed = popDatabaseViewRedoEntry(
      `${DATABASE_ID}:${VIEW_ID}`,
      before!
    );
    expect(replayed).toEqual(cleared);
  });

  it("clears the session redo target on a new edit", () => {
    recordDatabaseViewEditHistory(DATABASE_ID, view(), { nowMs: 0 });
    popDatabaseViewUndoEntry(
      `${DATABASE_ID}:${VIEW_ID}`,
      view({ filter: undefined })
    );
    expect(getLastSessionUndoKind()).toBeNull();

    recordDatabaseViewEditHistory(DATABASE_ID, view(), { nowMs: 1 });
    expect(tryRedoDatabaseViewEdit()).toBe(false);
  });
});

describe("tryUndoDatabaseViewEdit / tryRedoDatabaseViewEdit", () => {
  it("restores through the collection ops helper", () => {
    const before = view();
    const cleared = view({ filter: undefined });

    vi.mocked(localDatabasesCollection.get).mockReturnValue({
      id: DATABASE_ID,
      fields: [],
      views: [cleared],
      updatedAt: "now",
    } as never);

    recordDatabaseViewEditHistory(DATABASE_ID, before, { nowMs: 0 });
    expect(tryUndoDatabaseViewEdit()).toBe(true);
    expect(restoreDatabaseView).toHaveBeenCalledWith(DATABASE_ID, before);
    expect(getLastSessionUndoKind()).toBe("database-view");

    expect(tryRedoDatabaseViewEdit()).toBe(true);
    expect(restoreDatabaseView).toHaveBeenLastCalledWith(DATABASE_ID, cleared);
  });
});
