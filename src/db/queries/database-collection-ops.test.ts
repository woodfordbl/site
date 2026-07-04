import { types } from "node:util";
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
    mocks.rowGet.mockReturnValue(row);
    const captured = captureRowDrafts([row]);

    ops.updateDatabaseCell("row-1", "f-extra", 42);
    await flushAsync();

    const draft = captured.get("row-1");
    expect(draft?.values).toEqual({ "f-extra": 42, "f-title": "keep" });
    expect(draft?.updatedAt).not.toBe(row.updatedAt);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("updateDatabaseCell is a silent no-op when the row no longer exists", async () => {
    // A sync tombstone (or cross-tab delete) can remove the row while its
    // cell editor is open; update() on a missing key would throw uncaught.
    mocks.rowGet.mockReturnValue(undefined);

    ops.updateDatabaseCell("row-deleted", "f-extra", 42);
    await flushAsync();

    expect(mocks.rowUpdate).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
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

  it("updateDatabaseView flattens draft proxies so record configs stay writable", async () => {
    // Mimic TanStack DB change-tracking drafts: the views array, each view,
    // its config, and the record values inside it arrive as proxies. Spreading
    // them into the stored document made zod v4's z.record validation reject
    // the NEXT write once calculations/columnWidths existed.
    const base = makeDatabase();
    const proxiedViews = base.views.map(
      (view) =>
        new Proxy(
          {
            ...view,
            config: new Proxy(
              {
                ...view.config,
                calculations: new Proxy({ "f-extra": "sum" as const }, {}),
              },
              {}
            ),
          },
          {}
        )
    );
    const draft: LocalDatabase = { ...base, views: proxiedViews };
    const captured: LocalDatabase[] = [];
    mocks.databaseUpdate.mockImplementation(
      (_id: string, update: (value: LocalDatabase) => void) => {
        update(draft);
        captured.push(draft);
        return draft;
      }
    );

    ops.updateDatabaseView(databaseId, "view-1", {
      sorts: [{ fieldId: "f-title", direction: "desc" }],
    });
    await flushAsync();

    const view = captured[0]?.views[0];
    expect(view).toBeDefined();
    if (!view) {
      return;
    }
    expect(types.isProxy(view)).toBe(false);
    expect(types.isProxy(view.config)).toBe(false);
    expect(types.isProxy(view.config.calculations)).toBe(false);
    expect(view.config.calculations).toEqual({ "f-extra": "sum" });
    expect(view.sorts).toEqual([{ fieldId: "f-title", direction: "desc" }]);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
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

  it("reorderDatabaseFields rebuilds the fields array in the given order", async () => {
    const database = makeDatabase();
    const databaseDrafts = captureDatabaseDrafts(database);

    ops.reorderDatabaseFields(databaseId, ["f-extra", "f-title"]);
    await flushAsync();

    const draft = databaseDrafts[0];
    expect(draft?.fields.map((field) => field.id)).toEqual([
      "f-extra",
      "f-title",
    ]);
    expect(draft?.updatedAt).not.toBe(database.updatedAt);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("reorderDatabaseFields ignores unknown ids and appends missing ids in prior order", async () => {
    const database = makeDatabase();
    const databaseDrafts = captureDatabaseDrafts(database);

    ops.reorderDatabaseFields(databaseId, ["f-ghost", "f-extra"]);
    await flushAsync();

    expect(databaseDrafts[0]?.fields.map((field) => field.id)).toEqual([
      "f-extra",
      "f-title",
    ]);
  });

  it("reorderDatabaseFields keeps only the first occurrence of duplicated ids", async () => {
    const database = makeDatabase();
    const databaseDrafts = captureDatabaseDrafts(database);

    ops.reorderDatabaseFields(databaseId, [
      "f-extra",
      "f-extra",
      "f-title",
      "f-extra",
    ]);
    await flushAsync();

    expect(databaseDrafts[0]?.fields.map((field) => field.id)).toEqual([
      "f-extra",
      "f-title",
    ]);
  });

  it("duplicateDatabaseField strips sourceKey so the copy is a local field", async () => {
    const database = makeDatabase();
    database.fields = [
      { id: "f-title", name: "Name", type: "text" },
      { id: "f-synced", name: "Stars", type: "number", sourceKey: "stars" },
    ];
    mocks.databaseGet.mockReturnValue(database);
    mocks.rowState = [makeRow("row-1", { values: { "f-synced": 42 } })];
    const databaseDrafts = captureDatabaseDrafts(database);
    const rowDrafts = captureRowDrafts(mocks.rowState as LocalDatabaseRow[]);

    ops.duplicateDatabaseField(databaseId, "f-synced");
    await flushAsync();

    const copy = databaseDrafts[0]?.fields[2];
    expect(copy?.name).toBe("Stars copy");
    expect(copy?.sourceKey).toBeUndefined();
    expect(copy && "sourceKey" in copy).toBe(false);
    // Values still copy — the duplicate keeps the current data as local cells.
    expect(copy && rowDrafts.get("row-1")?.values[copy.id]).toBe(42);
  });

  it("deleteDatabaseRows skips rows carrying an externalId", async () => {
    const syncedRow = { ...makeRow("row-synced"), externalId: "ext-1" };
    const localRow = makeRow("row-local");
    mocks.rowGet.mockImplementation((id: string) =>
      id === "row-synced" ? syncedRow : localRow
    );

    ops.deleteDatabaseRows(["row-synced", "row-local"]);
    await flushAsync();

    expect(mocks.rowDelete).toHaveBeenCalledTimes(1);
    expect(mocks.rowDelete).toHaveBeenCalledWith("row-local");
  });

  it("deleteDatabaseRows skips ids with no matching row", async () => {
    // `get(id)?.externalId === undefined` is true for a MISSING row too —
    // deleting a nonexistent key would throw mid-transaction and strand the
    // earlier deletes as uncommitted optimistic state.
    const localRow = makeRow("row-local");
    mocks.rowGet.mockImplementation((id: string) =>
      id === "row-local" ? localRow : undefined
    );

    ops.deleteDatabaseRows(["row-local", "row-gone"]);
    await flushAsync();

    expect(mocks.rowDelete).toHaveBeenCalledTimes(1);
    expect(mocks.rowDelete).toHaveBeenCalledWith("row-local");
  });

  it("deleteDatabaseRows with only missing ids never opens a transaction", async () => {
    mocks.rowGet.mockReturnValue(undefined);

    ops.deleteDatabaseRows(["row-gone-1", "row-gone-2"]);
    await flushAsync();

    expect(mocks.rowDelete).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("deleteDatabaseRows with only synced rows never opens a transaction", async () => {
    mocks.rowGet.mockReturnValue({
      ...makeRow("row-synced"),
      externalId: "ext-1",
    });

    ops.deleteDatabaseRows(["row-synced"]);
    await flushAsync();

    expect(mocks.rowDelete).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("updateDatabaseSource patches refreshMs on a connector database", async () => {
    const database: LocalDatabase = {
      ...makeDatabase(),
      source: {
        kind: "connector",
        connectorId: "frankfurter-rates",
        config: { base: "USD" },
      },
    };
    const databaseDrafts = captureDatabaseDrafts(database);

    ops.updateDatabaseSource(databaseId, { refreshMs: 300_000 });
    await flushAsync();

    const draft = databaseDrafts[0];
    expect(draft?.source).toEqual({
      kind: "connector",
      connectorId: "frankfurter-rates",
      config: { base: "USD" },
      refreshMs: 300_000,
    });
    expect(draft?.updatedAt).not.toBe(database.updatedAt);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("updateDatabaseSource with refreshMs undefined clears the override", async () => {
    const database: LocalDatabase = {
      ...makeDatabase(),
      source: {
        kind: "connector",
        connectorId: "frankfurter-rates",
        config: { base: "USD" },
        refreshMs: 60_000,
      },
    };
    const databaseDrafts = captureDatabaseDrafts(database);

    ops.updateDatabaseSource(databaseId, { refreshMs: undefined });
    await flushAsync();

    const draft = databaseDrafts[0];
    expect(draft?.source?.kind).toBe("connector");
    expect(
      draft?.source?.kind === "connector" && "refreshMs" in draft.source
    ).toBe(false);
  });

  it("updateDatabaseSource leaves local databases untouched", async () => {
    const database = makeDatabase();
    const databaseDrafts = captureDatabaseDrafts(database);

    ops.updateDatabaseSource(databaseId, { refreshMs: 60_000 });
    await flushAsync();

    const draft = databaseDrafts[0];
    expect(draft?.source).toBeUndefined();
    expect(draft?.updatedAt).toBe(database.updatedAt);
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

  it("setDatabaseRowPageId links the page id and bumps updatedAt", async () => {
    const row = makeRow("row-1");
    mocks.rowGet.mockReturnValue(row);
    const drafts = captureRowDrafts([row]);

    ops.setDatabaseRowPageId("row-1", "page-9");
    await flushAsync();

    const draft = drafts.get("row-1");
    expect(draft?.pageId).toBe("page-9");
    expect(draft?.updatedAt).not.toBe(row.updatedAt);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("setDatabaseRowPageId is a no-op for unknown rows", async () => {
    mocks.rowGet.mockReturnValue(undefined);

    ops.setDatabaseRowPageId("row-missing", "page-9");
    await flushAsync();

    expect(mocks.rowUpdate).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("setDatabaseRowPageId refuses synced rows (externalId present)", async () => {
    // Invariant: synced rows never get pages — the sync engine tombstones
    // them, which would orphan the linked page.
    mocks.rowGet.mockReturnValue({
      ...makeRow("row-synced"),
      externalId: "ext-1",
    });

    ops.setDatabaseRowPageId("row-synced", "page-9");
    await flushAsync();

    expect(mocks.rowUpdate).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("duplicateDatabaseField regenerates select option ids and remaps row values", async () => {
    const database = makeDatabase();
    database.fields = [
      { id: "f-title", name: "Name", type: "text" },
      {
        id: "f-status",
        name: "Status",
        type: "select",
        options: [
          { id: "opt-a", name: "Alpha", color: "green" },
          { id: "opt-b", name: "Beta", color: "red" },
        ],
      },
    ];
    mocks.databaseGet.mockReturnValue(database);
    mocks.rowState = [
      makeRow("row-1", { values: { "f-status": "opt-b" } }),
      makeRow("row-2", { values: { "f-status": "opt-ghost" } }),
    ];
    const databaseDrafts = captureDatabaseDrafts(database);
    const rowDrafts = captureRowDrafts(mocks.rowState as LocalDatabaseRow[]);

    ops.duplicateDatabaseField(databaseId, "f-status");
    await flushAsync();

    const copy = databaseDrafts[0]?.fields[2];
    expect(copy?.type).toBe("select");
    if (copy?.type !== "select") {
      return;
    }
    // Fresh option ids, same names/colors, same order — never the source ids
    // (shared ids would break the option-id-uniqueness assumption that the
    // recolor helper relies on).
    expect(copy.options.map((option) => option.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(copy.options.map((option) => option.color)).toEqual([
      "green",
      "red",
    ]);
    expect(copy.options[0]?.id).not.toBe("opt-a");
    expect(copy.options[1]?.id).not.toBe("opt-b");
    expect(copy.options[0]?.id).not.toBe(copy.options[1]?.id);

    // Row values are remapped through the old→new id map in the same commit.
    const newBetaId = copy.options[1]?.id;
    expect(rowDrafts.get("row-1")?.values[copy.id]).toBe(newBetaId);
    expect(rowDrafts.get("row-1")?.values["f-status"]).toBe("opt-b");
    // Ids that were already stale in the source stay as-is in the copy.
    expect(rowDrafts.get("row-2")?.values[copy.id]).toBe("opt-ghost");
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("addDatabaseView appends an empty table view with a deduped default name", async () => {
    // makeDatabase already has a view named "Table" — the new one suffixes.
    const database = makeDatabase();
    mocks.databaseGet.mockReturnValue(database);
    const databaseDrafts = captureDatabaseDrafts(database);

    const created = ops.addDatabaseView(databaseId, { type: "table" });
    await flushAsync();

    expect(created?.name).toBe("Table 2");
    expect(created?.type).toBe("table");
    expect(created?.config).toEqual({});
    const draft = databaseDrafts[0];
    expect(draft?.views).toHaveLength(2);
    expect(draft?.views[1]?.id).toBe(created?.id);
    expect(draft?.updatedAt).not.toBe(database.updatedAt);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("addDatabaseView dedupes across numeric suffixes and honors a custom name", () => {
    const database = makeDatabase();
    database.views = [
      { ...database.views[0], id: "view-1", name: "List" },
      { ...database.views[0], id: "view-2", name: "List 2" },
    ];
    mocks.databaseGet.mockReturnValue(database);
    captureDatabaseDrafts(database);

    const created = ops.addDatabaseView(databaseId, { type: "list" });
    expect(created?.name).toBe("List 3");

    const named = ops.addDatabaseView(databaseId, {
      type: "list",
      name: "Reading list",
    });
    expect(named?.name).toBe("Reading list");
  });

  it("addDatabaseView seeds a board with the first select field as groupFieldId", () => {
    const database = makeDatabase();
    database.fields = [
      { id: "f-title", name: "Name", type: "text" },
      { id: "f-tags", name: "Tags", type: "multiSelect", options: [] },
      { id: "f-status", name: "Status", type: "select", options: [] },
      { id: "f-stage", name: "Stage", type: "select", options: [] },
    ];
    mocks.databaseGet.mockReturnValue(database);
    captureDatabaseDrafts(database);

    const created = ops.addDatabaseView(databaseId, { type: "board" });

    expect(created?.name).toBe("Board");
    // multiSelect is skipped — the FIRST select field becomes the lane source.
    expect(created?.config).toEqual({ board: { groupFieldId: "f-status" } });
  });

  it("addDatabaseView seeds an empty board config when no select field exists", () => {
    const database = makeDatabase();
    mocks.databaseGet.mockReturnValue(database);
    captureDatabaseDrafts(database);

    const created = ops.addDatabaseView(databaseId, { type: "board" });

    expect(created?.config).toEqual({});
  });

  it("addDatabaseView seeds a chart with bar/count over the first select-or-date field", () => {
    const database = makeDatabase();
    database.fields = [
      { id: "f-title", name: "Name", type: "text" },
      { id: "f-due", name: "Due", type: "date" },
      { id: "f-status", name: "Status", type: "select", options: [] },
    ];
    mocks.databaseGet.mockReturnValue(database);
    captureDatabaseDrafts(database);

    const created = ops.addDatabaseView(databaseId, { type: "chart" });

    expect(created?.name).toBe("Chart");
    expect(created?.config).toEqual({
      chart: { mark: "bar", xFieldId: "f-due", yAggregate: "count" },
    });
  });

  it("addDatabaseView chart config omits xFieldId when no select/date field exists", () => {
    const database = makeDatabase();
    mocks.databaseGet.mockReturnValue(database);
    captureDatabaseDrafts(database);

    const created = ops.addDatabaseView(databaseId, { type: "chart" });

    // The unset pick must be ABSENT, not an explicit undefined key.
    expect(created?.config).toEqual({
      chart: { mark: "bar", yAggregate: "count" },
    });
    expect(created && "xFieldId" in (created.config.chart ?? {})).toBe(false);
  });

  it("addDatabaseView no-ops for an unknown database", async () => {
    mocks.databaseGet.mockReturnValue(undefined);

    const created = ops.addDatabaseView(databaseId, { type: "table" });
    await flushAsync();

    expect(created).toBeUndefined();
    expect(mocks.databaseUpdate).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("removeDatabaseView removes the matching view", async () => {
    const database = makeDatabase();
    database.views = [
      { ...database.views[0], id: "view-1", name: "Table" },
      { ...database.views[0], id: "view-2", name: "Board" },
    ];
    mocks.databaseGet.mockReturnValue(database);
    const databaseDrafts = captureDatabaseDrafts(database);

    ops.removeDatabaseView(databaseId, "view-2");
    await flushAsync();

    const draft = databaseDrafts[0];
    expect(draft?.views.map((view) => view.id)).toEqual(["view-1"]);
    expect(draft?.updatedAt).not.toBe(database.updatedAt);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("removeDatabaseView refuses to remove the last view", async () => {
    const database = makeDatabase();
    mocks.databaseGet.mockReturnValue(database);

    ops.removeDatabaseView(databaseId, "view-1");
    await flushAsync();

    expect(mocks.databaseUpdate).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("removeDatabaseView no-ops for an unknown view id", async () => {
    const database = makeDatabase();
    database.views = [
      { ...database.views[0], id: "view-1" },
      { ...database.views[0], id: "view-2" },
    ];
    mocks.databaseGet.mockReturnValue(database);

    ops.removeDatabaseView(databaseId, "view-ghost");
    await flushAsync();

    expect(mocks.databaseUpdate).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("duplicateDatabaseView deep-copies the view after the original as '<name> copy'", async () => {
    const database = makeDatabase();
    database.views = [
      { ...database.views[0], id: "view-1", name: "Table" },
      {
        id: "view-2",
        name: "Board",
        type: "board",
        config: { board: { groupFieldId: "f-status" } },
      },
    ];
    mocks.databaseGet.mockReturnValue(database);
    const databaseDrafts = captureDatabaseDrafts(database);

    const copy = ops.duplicateDatabaseView(databaseId, "view-1");
    await flushAsync();

    expect(copy?.name).toBe("Table copy");
    expect(copy?.id).not.toBe("view-1");
    expect(copy?.filter).toEqual(database.views[0]?.filter);
    expect(copy?.config).toEqual(database.views[0]?.config);
    // Deep copy — the source's nested config must not be shared by reference.
    expect(copy?.config).not.toBe(database.views[0]?.config);

    // Inserted right after the original, before the board view.
    const draft = databaseDrafts[0];
    expect(draft?.views.map((view) => view.id)).toEqual([
      "view-1",
      copy?.id,
      "view-2",
    ]);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it("duplicateDatabaseView no-ops for an unknown view id", async () => {
    mocks.databaseGet.mockReturnValue(makeDatabase());

    const copy = ops.duplicateDatabaseView(databaseId, "view-ghost");
    await flushAsync();

    expect(copy).toBeUndefined();
    expect(mocks.databaseUpdate).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("duplicateDatabaseField remaps multiSelect arrays through fresh option ids", async () => {
    const database = makeDatabase();
    database.fields = [
      { id: "f-title", name: "Name", type: "text" },
      {
        id: "f-tags",
        name: "Tags",
        type: "multiSelect",
        options: [
          { id: "opt-x", name: "X", color: "blue" },
          { id: "opt-y", name: "Y", color: "yellow" },
        ],
      },
    ];
    mocks.databaseGet.mockReturnValue(database);
    mocks.rowState = [
      makeRow("row-1", { values: { "f-tags": ["opt-y", "opt-x"] } }),
    ];
    const databaseDrafts = captureDatabaseDrafts(database);
    const rowDrafts = captureRowDrafts(mocks.rowState as LocalDatabaseRow[]);

    ops.duplicateDatabaseField(databaseId, "f-tags");
    await flushAsync();

    const copy = databaseDrafts[0]?.fields[2];
    expect(copy?.type).toBe("multiSelect");
    if (copy?.type !== "multiSelect") {
      return;
    }
    const newXId = copy.options[0]?.id;
    const newYId = copy.options[1]?.id;
    expect(newXId).not.toBe("opt-x");
    expect(newYId).not.toBe("opt-y");

    // Stored (click) order is preserved; each id maps old → new.
    expect(rowDrafts.get("row-1")?.values[copy.id]).toEqual([newYId, newXId]);
    expect(rowDrafts.get("row-1")?.values["f-tags"]).toEqual([
      "opt-y",
      "opt-x",
    ]);
  });
});
