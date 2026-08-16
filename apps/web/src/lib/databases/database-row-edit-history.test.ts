import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

const restoreDatabaseRows = vi.hoisted(() => vi.fn());
const reapplyDatabaseRowDeletion = vi.hoisted(() => vi.fn());
const deleteDatabaseRows = vi.hoisted(() => vi.fn());
const deleteLiveMarketRows = vi.hoisted(() => vi.fn());
const rowGet = vi.hoisted(() => vi.fn());
const databaseGet = vi.hoisted(() => vi.fn());

vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabaseRowsCollection: {
    get: rowGet,
  },
  localDatabasesCollection: {
    get: databaseGet,
  },
}));

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  deleteDatabaseRows,
  deleteLiveMarketRows,
  reapplyDatabaseRowDeletion,
  restoreDatabaseRows,
}));

vi.mock("@/lib/databases/live-markets-instruments.ts", () => ({
  isLiveMarketsDatabase: (database: { source?: { connectorId?: string } }) =>
    database.source?.connectorId === "live-markets",
  readLiveMarketInstruments: () => [],
}));

import {
  clearAllDatabaseRowEditHistories,
  deleteDatabaseRowsUndoable,
  getLastDatabaseRowEditRecordedAt,
  tryRedoDatabaseRowEdit,
  tryUndoDatabaseRowEdit,
} from "@/lib/databases/database-row-edit-history.ts";
import { getLastSessionUndoKind } from "@/lib/databases/database-view-edit-history.ts";

function row(id: string): LocalDatabaseRow {
  return {
    id,
    databaseId: "db-1",
    values: { title: id },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

afterEach(() => {
  clearAllDatabaseRowEditHistories();
  restoreDatabaseRows.mockReset();
  reapplyDatabaseRowDeletion.mockReset();
  deleteDatabaseRows.mockReset();
  deleteLiveMarketRows.mockReset();
  rowGet.mockReset();
  databaseGet.mockReset();
});

describe("deleteDatabaseRowsUndoable", () => {
  it("records a session undo entry and deletes local rows", () => {
    const local = row("row-1");
    rowGet.mockImplementation((id: string) =>
      id === "row-1" ? local : undefined
    );
    databaseGet.mockReturnValue({ id: "db-1", fields: [], views: [] });

    expect(deleteDatabaseRowsUndoable(["row-1"], { nowMs: 10 })).toBe(true);
    expect(deleteDatabaseRows).toHaveBeenCalledWith(["row-1"]);
    expect(getLastDatabaseRowEditRecordedAt()).toBe(10);
  });

  it("skips synced non-live-market rows", () => {
    rowGet.mockReturnValue({ ...row("row-synced"), externalId: "ext-1" });
    databaseGet.mockReturnValue({ id: "db-1", fields: [], views: [] });

    expect(deleteDatabaseRowsUndoable(["row-synced"])).toBe(false);
    expect(deleteDatabaseRows).not.toHaveBeenCalled();
  });
});

describe("tryUndoDatabaseRowEdit / tryRedoDatabaseRowEdit", () => {
  it("restores deleted rows on undo and re-deletes on redo", () => {
    const local = row("row-1");
    rowGet.mockImplementation((id: string) =>
      id === "row-1" ? local : undefined
    );
    databaseGet.mockReturnValue({ id: "db-1", fields: [], views: [] });

    deleteDatabaseRowsUndoable(["row-1"], { nowMs: 1 });
    expect(tryUndoDatabaseRowEdit()).toBe(true);
    expect(restoreDatabaseRows).toHaveBeenCalledWith([local], {
      liveMarket: undefined,
    });
    expect(getLastSessionUndoKind()).toBe("database-rows");

    expect(tryRedoDatabaseRowEdit()).toBe(true);
    expect(reapplyDatabaseRowDeletion).toHaveBeenCalledWith(["row-1"], {
      liveMarket: undefined,
    });
  });
});
