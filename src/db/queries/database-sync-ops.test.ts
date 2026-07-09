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
  databaseGet: vi.fn(),
  databaseUpdate: vi.fn(),
  mutate: vi.fn(),
  reportPersistenceError: vi.fn(),
  rowDelete: vi.fn(),
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
    insert: mocks.rowInsert,
    get toArray() {
      return mocks.rowState;
    },
    update: mocks.rowUpdate,
    utils: { acceptMutations: mocks.acceptRowMutations },
  },
  localDatabasesCollection: {
    get: mocks.databaseGet,
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

function makeDatabase(): LocalDatabase {
  return {
    id: databaseId,
    name: "Repos",
    primaryFieldId: "f-name",
    source: {
      kind: "connector",
      connectorId: "github-repos",
      config: { username: "octocat" },
    },
    fields: [
      { id: "f-name", name: "Name", type: "text", sourceKey: "name" },
      { id: "f-stars", name: "Stars", type: "number", sourceKey: "stars" },
      { id: "f-notes", name: "My notes", type: "text" },
    ],
    views: [{ id: "view-1", name: "Table", type: "table", config: {} }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeSyncedRow(
  id: string,
  externalId: string,
  options?: {
    order?: number;
    values?: Record<string, DatabaseCellValue>;
  }
): LocalDatabaseRow {
  return {
    id,
    databaseId,
    externalId,
    values: options?.values ?? {},
    order: options?.order,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Runs queued row updaters against clones of `rows` and captures the drafts. */
function captureRowDrafts(
  rows: LocalDatabaseRow[]
): Map<string, LocalDatabaseRow> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const captured = new Map<string, LocalDatabaseRow>();
  mocks.rowUpdate.mockImplementation(
    (id: string, update: (draft: LocalDatabaseRow) => void) => {
      const source = byId.get(id);
      if (!source) {
        throw new Error(`updated unknown row ${id}`);
      }
      const draft = structuredClone(source);
      update(draft);
      captured.set(id, draft);
      return draft;
    }
  );
  return captured;
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

describe("database sync ops", () => {
  let ops: typeof import("@/db/queries/database-sync-ops.ts");

  beforeAll(async () => {
    ops = await import("@/db/queries/database-sync-ops.ts");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupTransactionMock();
    mocks.rowState = [];
    mocks.databaseGet.mockReturnValue(undefined);
  });

  describe("applySyncSnapshot", () => {
    it("inserts new external rows keyed by fieldId, appended, without pageId", async () => {
      mocks.rowState = [makeSyncedRow("row-a", "ext-a", { order: 1000 })];

      const result = ops.applySyncSnapshot(makeDatabase(), [
        {
          externalId: "ext-a",
          values: { name: "octocat/hello", stars: 1 },
        },
        {
          externalId: "ext-b",
          values: { name: "octocat/world", stars: 7, ghost: "dropped" },
        },
      ]);
      await flushAsync();

      expect(result.inserted).toBe(1);
      expect(result.removed).toBe(0);
      expect(mocks.rowInsert).toHaveBeenCalledTimes(1);
      const inserted = mocks.rowInsert.mock.calls[0]?.[0] as LocalDatabaseRow;
      expect(inserted.externalId).toBe("ext-b");
      expect(inserted.databaseId).toBe(databaseId);
      // Unknown source keys (removed upstream columns) are dropped.
      expect(inserted.values).toEqual({
        "f-name": "octocat/world",
        "f-stars": 7,
      });
      expect(inserted.order).toBe(2000);
      expect(inserted.pageId).toBeUndefined();
      expect(mocks.commit).toHaveBeenCalledTimes(1);
    });

    it("updates only synced field keys, preserving local values and order", async () => {
      const rows = [
        makeSyncedRow("row-a", "ext-a", {
          order: 4500,
          values: {
            "f-name": "octocat/hello",
            "f-stars": 1,
            "f-notes": "my local note",
          },
        }),
      ];
      mocks.rowState = rows;
      const captured = captureRowDrafts(rows);

      const result = ops.applySyncSnapshot(makeDatabase(), [
        { externalId: "ext-a", values: { name: "octocat/hello", stars: 2 } },
      ]);
      await flushAsync();

      expect(result).toMatchObject({ inserted: 0, removed: 0, updated: 1 });
      const draft = captured.get("row-a");
      expect(draft?.values).toEqual({
        "f-name": "octocat/hello",
        "f-notes": "my local note",
        "f-stars": 2,
      });
      expect(draft?.order).toBe(4500);
      expect(draft?.updatedAt).not.toBe(rows[0]?.updatedAt);
    });

    it("skips writes entirely when synced values are deep-equal", async () => {
      mocks.rowState = [
        makeSyncedRow("row-a", "ext-a", {
          values: { "f-name": "octocat/hello", "f-stars": 1, "f-notes": "x" },
        }),
      ];

      const result = ops.applySyncSnapshot(makeDatabase(), [
        { externalId: "ext-a", values: { name: "octocat/hello", stars: 1 } },
      ]);
      await flushAsync();

      expect(result).toMatchObject({ inserted: 0, removed: 0, updated: 0 });
      expect(mocks.rowUpdate).not.toHaveBeenCalled();
      expect(mocks.createTransaction).not.toHaveBeenCalled();
      expect(mocks.commit).not.toHaveBeenCalled();
    });

    it("gives a missing row one sync of grace before deleting it", async () => {
      mocks.rowState = [makeSyncedRow("row-a", "ext-a")];

      const first = ops.applySyncSnapshot(makeDatabase(), [], {});
      await flushAsync();

      expect(first.removed).toBe(0);
      expect(first.missingCounts).toEqual({ "ext-a": 1 });
      expect(mocks.rowDelete).not.toHaveBeenCalled();

      const second = ops.applySyncSnapshot(makeDatabase(), [], {
        "ext-a": 1,
      });
      await flushAsync();

      expect(second.removed).toBe(1);
      expect(second.missingCounts).toEqual({});
      expect(mocks.rowDelete).toHaveBeenCalledWith("row-a");
    });

    it("deletes a missing row immediately when pruneMissing is set", async () => {
      // A symbol dropped from the source config: the omission is intentional,
      // so the refetch prunes it on this very snapshot with no tombstone grace.
      mocks.rowState = [makeSyncedRow("row-a", "ext-a")];

      const result = ops.applySyncSnapshot(
        makeDatabase(),
        [],
        {},
        { pruneMissing: true }
      );
      await flushAsync();

      expect(result.removed).toBe(1);
      expect(result.missingCounts).toEqual({});
      expect(mocks.rowDelete).toHaveBeenCalledWith("row-a");
    });

    it("resets the tombstone count when a row reappears", async () => {
      mocks.rowState = [
        makeSyncedRow("row-a", "ext-a", {
          values: { "f-name": "octocat/hello" },
        }),
      ];

      const result = ops.applySyncSnapshot(
        makeDatabase(),
        [{ externalId: "ext-a", values: { name: "octocat/hello" } }],
        { "ext-a": 1 }
      );
      await flushAsync();

      expect(result.missingCounts).toEqual({});
      expect(result.removed).toBe(0);
      expect(mocks.rowDelete).not.toHaveBeenCalled();
    });

    it("resolves `persisted` once the row transaction commit succeeds", async () => {
      mocks.rowState = [];

      const result = ops.applySyncSnapshot(makeDatabase(), [
        { externalId: "ext-a", values: { name: "octocat/hello" } },
      ]);

      await expect(result.persisted).resolves.toBeUndefined();
      expect(mocks.commit).toHaveBeenCalledTimes(1);
      expect(mocks.reportPersistenceError).not.toHaveBeenCalled();
    });

    it("rejects `persisted` on commit failure after reporting it", async () => {
      const commitError = new Error("QuotaExceededError");
      mocks.createTransaction.mockImplementation(() => ({
        commit: mocks.commit.mockImplementation(() =>
          Promise.reject(commitError)
        ),
        mutate: mocks.mutate.mockImplementation((callback: () => void) =>
          callback()
        ),
      }));
      mocks.rowState = [];

      const result = ops.applySyncSnapshot(makeDatabase(), [
        { externalId: "ext-a", values: { name: "octocat/hello" } },
      ]);

      await expect(result.persisted).rejects.toBe(commitError);
      expect(mocks.reportPersistenceError).toHaveBeenCalledWith(commitError);
    });

    it("resolves `persisted` immediately when the snapshot needs no writes", async () => {
      mocks.rowState = [
        makeSyncedRow("row-a", "ext-a", {
          values: { "f-name": "octocat/hello" },
        }),
      ];

      const result = ops.applySyncSnapshot(makeDatabase(), [
        { externalId: "ext-a", values: { name: "octocat/hello" } },
      ]);

      await expect(result.persisted).resolves.toBeUndefined();
      expect(mocks.createTransaction).not.toHaveBeenCalled();
    });

    it("never counts local (non-synced) rows as missing", async () => {
      const localRow: LocalDatabaseRow = {
        id: "row-local",
        databaseId,
        values: { "f-notes": "hand-authored" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      mocks.rowState = [localRow];

      const result = ops.applySyncSnapshot(makeDatabase(), []);
      await flushAsync();

      expect(result.missingCounts).toEqual({});
      expect(result.removed).toBe(0);
    });
  });

  describe("reconcileSyncedFields", () => {
    it("adds connector fields with unseen sourceKeys, keeping existing fields", async () => {
      const database = makeDatabase();
      const drafts = captureDatabaseDrafts(database);

      const added = ops.reconcileSyncedFields(database, [
        // Renamed locally — matched by sourceKey, must not be re-added.
        { name: "Repository", sourceKey: "name", type: "text" },
        {
          name: "Forks",
          numberFormat: "integer",
          sourceKey: "forks",
          type: "number",
        },
      ]);
      await flushAsync();

      expect(added).toBe(1);
      const fields = drafts[0]?.fields ?? [];
      expect(fields.map((field) => field.sourceKey)).toEqual([
        "name",
        "stars",
        undefined,
        "forks",
      ]);
      // The pre-existing "name" field kept its local rename and identity.
      expect(fields[0]).toMatchObject({ id: "f-name", name: "Name" });
      const forks = fields[3];
      expect(forks).toMatchObject({ name: "Forks", type: "number" });
      expect(forks?.type === "number" && forks.format).toBe("integer");
      expect(mocks.commit).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when the connector has no new sourceKeys", async () => {
      const added = ops.reconcileSyncedFields(makeDatabase(), [
        { name: "Name", sourceKey: "name", type: "text" },
        { name: "Stars", sourceKey: "stars", type: "number" },
      ]);
      await flushAsync();

      expect(added).toBe(0);
      expect(mocks.databaseUpdate).not.toHaveBeenCalled();
      expect(mocks.commit).not.toHaveBeenCalled();
    });
  });
});
