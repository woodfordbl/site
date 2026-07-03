import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DatabaseCellValue,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const mocks = vi.hoisted(() => ({
  acceptDatabaseMutations: vi.fn(),
  acceptRowMutations: vi.fn(),
  commit: vi.fn(),
  createTransaction: vi.fn(),
  databaseDelete: vi.fn(),
  databaseGet: vi.fn(),
  databaseInsert: vi.fn(),
  databaseUpdate: vi.fn(),
  mutate: vi.fn(),
  reportPersistenceError: vi.fn(),
  rowDelete: vi.fn(),
  rowGet: vi.fn(),
  rowInsert: vi.fn(),
  rowState: [] as unknown[],
  rowUpdate: vi.fn(),
}));

vi.mock("@tanstack/react-db", () => ({
  createTransaction: mocks.createTransaction,
}));

vi.mock("@/db/persistence-errors.ts", () => ({
  reportPersistenceError: mocks.reportPersistenceError,
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabaseRowsCollection: {
    delete: mocks.rowDelete,
    get: mocks.rowGet,
    insert: mocks.rowInsert,
    get toArray() {
      return mocks.rowState;
    },
    update: mocks.rowUpdate,
    utils: { acceptMutations: mocks.acceptRowMutations },
  },
  localDatabasesCollection: {
    delete: mocks.databaseDelete,
    get: mocks.databaseGet,
    insert: mocks.databaseInsert,
    update: mocks.databaseUpdate,
    utils: { acceptMutations: mocks.acceptDatabaseMutations },
  },
}));

function flushAsync(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function setupTransactionMock(): void {
  mocks.createTransaction.mockImplementation(
    ({
      mutationFn,
    }: {
      mutationFn: (options: { transaction: unknown }) => Promise<void>;
    }) => ({
      commit: mocks.commit.mockImplementation(() =>
        Promise.resolve(mutationFn({ transaction: { id: "tx-1" } }))
      ),
      mutate: mocks.mutate.mockImplementation((callback: () => void) =>
        callback()
      ),
    })
  );
}

const databaseId = "db-1";

function makeRow(
  id: string,
  options?: {
    databaseId?: string;
    order?: number;
    values?: Record<string, DatabaseCellValue>;
  }
): LocalDatabaseRow {
  return {
    id,
    databaseId: options?.databaseId ?? databaseId,
    values: options?.values ?? {},
    order: options?.order,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeDatabase(): LocalDatabase {
  return {
    id: databaseId,
    name: "Tasks",
    primaryFieldId: "f-title",
    fields: [
      { id: "f-title", name: "Name", type: "text" },
      { id: "f-extra", name: "Extra", type: "number" },
    ],
    views: [
      {
        id: "view-1",
        name: "Table",
        type: "table",
        visibleFieldIds: ["f-title", "f-extra"],
        sorts: [
          { fieldId: "f-extra", direction: "asc" },
          { fieldId: "f-title", direction: "asc" },
        ],
        filter: {
          op: "and",
          conditions: [
            {
              id: "cond-1",
              fieldId: "f-extra",
              operator: "gt",
              value: 1,
            },
            {
              id: "group-1",
              op: "or",
              conditions: [
                {
                  id: "cond-2",
                  fieldId: "f-extra",
                  operator: "isEmpty",
                },
              ],
            },
            {
              id: "cond-3",
              fieldId: "f-title",
              operator: "isNotEmpty",
            },
          ],
        },
        config: {
          columnOrder: ["f-extra", "f-title"],
          columnWidths: { "f-extra": 120, "f-title": 240 },
          pinnedFieldIds: ["f-extra"],
          calculations: { "f-extra": "sum" },
          wrapFieldIds: ["f-extra"],
        },
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Runs queued database updaters against a clone and captures the drafts. */
function captureDatabaseDrafts(database: LocalDatabase): LocalDatabase[] {
  const captured: LocalDatabase[] = [];
  mocks.databaseUpdate.mockImplementation(
    (_id: string, update: (draft: LocalDatabase) => void) => {
      const draft = structuredClone(database);
      update(draft);
      captured.push(draft);
      return draft;
    }
  );
  return captured;
}

/** Runs queued row updaters against clones of `rows` and captures the drafts. */
function captureRowDrafts(
  rows: LocalDatabaseRow[]
): Map<string, LocalDatabaseRow> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const captured = new Map<string, LocalDatabaseRow>();
  mocks.rowUpdate.mockImplementation(
    (id: string, update: (draft: LocalDatabaseRow) => void) => {
      const source = byId.get(id) ?? makeRow(id);
      const draft = structuredClone(source);
      update(draft);
      captured.set(id, draft);
      return draft;
    }
  );
  return captured;
}

describe("database collection ops", () => {
  let ops: typeof import("@/db/queries/database-collection-ops.ts");

  beforeAll(async () => {
    ops = await import("@/db/queries/database-collection-ops.ts");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupTransactionMock();
    mocks.rowState = [];
    mocks.databaseGet.mockReturnValue(undefined);
    mocks.rowGet.mockReturnValue(undefined);
  });

  it("createDatabaseWithDefaults inserts the definition and seed rows in one commit", async () => {
    const seed = {
      database: makeDatabase(),
      rows: [makeRow("row-a", { order: 0 }), makeRow("row-b", { order: 1000 })],
    };

    ops.createDatabaseWithDefaults(seed);
    await flushAsync();

    expect(mocks.databaseInsert).toHaveBeenCalledTimes(1);
    expect(mocks.databaseInsert).toHaveBeenCalledWith(seed.database);
    expect(mocks.rowInsert).toHaveBeenCalledTimes(2);
    expect(mocks.rowInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "row-a", databaseId })
    );
    expect(mocks.rowInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "row-b", databaseId })
    );
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.acceptDatabaseMutations).toHaveBeenCalledTimes(1);
    expect(mocks.acceptRowMutations).toHaveBeenCalledTimes(1);
  });

  it("updateDatabaseCell merges the value into row.values and bumps updatedAt", async () => {
    const row = makeRow("row-1", { values: { "f-title": "keep" } });
    const captured = captureRowDrafts([row]);

    ops.updateDatabaseCell("row-1", "f-extra", 42);
    await flushAsync();

    const draft = captured.get("row-1");
    expect(draft?.values).toEqual({ "f-extra": 42, "f-title": "keep" });
    expect(draft?.updatedAt).not.toBe(row.updatedAt);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("insertDatabaseRow appends with sparse order after the last row", async () => {
    mocks.rowState = [
      makeRow("row-a", { order: 1000 }),
      makeRow("row-b", { order: 2000 }),
    ];

    const inserted = ops.insertDatabaseRow(databaseId);
    await flushAsync();

    expect(inserted.order).toBe(3000);
    expect(inserted.values).toEqual({});
    expect(mocks.rowInsert).toHaveBeenCalledWith(
      expect.objectContaining({ databaseId, order: 3000 })
    );
    expect(mocks.rowUpdate).not.toHaveBeenCalled();
  });

  it("insertDatabaseRow after a row takes the midpoint to its successor", async () => {
    mocks.rowState = [
      makeRow("row-a", { order: 1000 }),
      makeRow("row-b", { order: 2000 }),
    ];

    const inserted = ops.insertDatabaseRow(databaseId, { after: "row-a" });
    await flushAsync();

    expect(inserted.order).toBe(1500);
  });

  it("reorderDatabaseRow before a row takes the midpoint between neighbors", async () => {
    const rows = [
      makeRow("row-a", { order: 1000 }),
      makeRow("row-b", { order: 2000 }),
      makeRow("row-c", { order: 3000 }),
    ];
    mocks.rowState = rows;
    mocks.rowGet.mockReturnValue(rows[2]);
    const captured = captureRowDrafts(rows);

    ops.reorderDatabaseRow("row-c", { beforeRowId: "row-b" });
    await flushAsync();

    expect(captured.get("row-c")?.order).toBe(1500);
    expect(mocks.rowUpdate).toHaveBeenCalledTimes(1);
  });

  it("reorderDatabaseRow renumbers the scope when neighbor orders leave no gap", async () => {
    const rows = [
      makeRow("row-a", { order: 1000 }),
      makeRow("row-b", { order: 1000 }),
      makeRow("row-c", { order: 3000 }),
    ];
    mocks.rowState = rows;
    mocks.rowGet.mockReturnValue(rows[2]);
    const captured = captureRowDrafts(rows);

    ops.reorderDatabaseRow("row-c", { beforeRowId: "row-b" });
    await flushAsync();

    expect(captured.get("row-a")?.order).toBe(0);
    expect(captured.get("row-b")?.order).toBe(2000);
    expect(captured.get("row-c")?.order).toBe(1000);
  });

  it("removeDatabaseField strips the field from rows and every view reference", async () => {
    const database = makeDatabase();
    mocks.databaseGet.mockReturnValue(database);
    mocks.rowState = [
      makeRow("row-1", { values: { "f-extra": 7, "f-title": "keep" } }),
      makeRow("row-2", { values: { "f-title": "no extra" } }),
      makeRow("row-3", {
        databaseId: "db-other",
        values: { "f-extra": 9 },
      }),
    ];
    const databaseDrafts = captureDatabaseDrafts(database);
    const rowDrafts = captureRowDrafts(mocks.rowState as LocalDatabaseRow[]);

    ops.removeDatabaseField(databaseId, "f-extra");
    await flushAsync();

    const draft = databaseDrafts[0];
    expect(draft?.fields.map((field) => field.id)).toEqual(["f-title"]);

    const view = draft?.views[0];
    expect(view?.visibleFieldIds).toEqual(["f-title"]);
    expect(view?.sorts).toEqual([{ fieldId: "f-title", direction: "asc" }]);
    expect(view?.filter?.conditions).toEqual([
      { id: "cond-3", fieldId: "f-title", operator: "isNotEmpty" },
    ]);
    expect(view?.config.columnOrder).toEqual(["f-title"]);
    expect(view?.config.columnWidths).toEqual({ "f-title": 240 });
    expect(view?.config.pinnedFieldIds).toEqual([]);
    expect(view?.config.calculations).toEqual({});
    expect(view?.config.wrapFieldIds).toEqual([]);

    expect(mocks.rowUpdate).toHaveBeenCalledTimes(1);
    expect(rowDrafts.get("row-1")?.values).toEqual({ "f-title": "keep" });
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("removeDatabaseField refuses to remove the primary field", async () => {
    mocks.databaseGet.mockReturnValue(makeDatabase());

    ops.removeDatabaseField(databaseId, "f-title");
    await flushAsync();

    expect(mocks.databaseUpdate).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("duplicateDatabaseField copies config and row values under a new id", async () => {
    const database = makeDatabase();
    mocks.databaseGet.mockReturnValue(database);
    mocks.rowState = [
      makeRow("row-1", { values: { "f-extra": 7 } }),
      makeRow("row-2", { values: {} }),
    ];
    const databaseDrafts = captureDatabaseDrafts(database);
    const rowDrafts = captureRowDrafts(mocks.rowState as LocalDatabaseRow[]);

    ops.duplicateDatabaseField(databaseId, "f-extra");
    await flushAsync();

    const fields = databaseDrafts[0]?.fields ?? [];
    expect(fields).toHaveLength(3);
    const copy = fields[2];
    expect(copy?.name).toBe("Extra copy");
    expect(copy?.type).toBe("number");
    expect(copy?.id).not.toBe("f-extra");

    expect(mocks.rowUpdate).toHaveBeenCalledTimes(1);
    const rowDraft = rowDrafts.get("row-1");
    expect(rowDraft?.values["f-extra"]).toBe(7);
    expect(copy && rowDraft?.values[copy.id]).toBe(7);
  });

  it("deleteDatabase deletes the definition and only its rows in one commit", async () => {
    mocks.databaseGet.mockReturnValue(makeDatabase());
    mocks.rowState = [
      makeRow("row-1"),
      makeRow("row-2"),
      makeRow("row-other", { databaseId: "db-other" }),
    ];

    ops.deleteDatabase(databaseId);
    await flushAsync();

    expect(mocks.databaseDelete).toHaveBeenCalledWith(databaseId);
    expect(mocks.rowDelete).toHaveBeenCalledTimes(2);
    expect(mocks.rowDelete).toHaveBeenCalledWith("row-1");
    expect(mocks.rowDelete).toHaveBeenCalledWith("row-2");
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });
});
