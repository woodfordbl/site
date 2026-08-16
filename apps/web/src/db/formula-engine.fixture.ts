import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import type { LocalFormulaFunction } from "@/lib/schemas/local-formula-function.ts";

/**
 * In-memory stand-in for `local-collections.ts` used by the formula-engine
 * tests: test files mock the collections module with this file
 * (`vi.mock("@/db/collections/local-collections.ts", () => import("@/db/formula-engine.fixture.ts"))`)
 * and drive it through {@link formulaEngineFixture} — seeding state, then
 * emitting insert/update/delete change events exactly like TanStack DB's
 * `subscribeChanges` would. The fake also satisfies what
 * `localFormulaRelationResolver` reads (`get` / `toArray`), so parity tests
 * can run the pure overlay path against the same data.
 */

type FakeChangeType = "delete" | "insert" | "update";

interface FakeChange<T> {
  key: string;
  previousValue?: T;
  type: FakeChangeType;
  value?: T;
}

type FakeListener<T> = (changes: FakeChange<T>[]) => void;

const databases = new Map<string, LocalDatabase>();
const rows = new Map<string, LocalDatabaseRow>();
const formulaFunctions = new Map<string, LocalFormulaFunction>();
const databaseListeners = new Set<FakeListener<LocalDatabase>>();
const rowListeners = new Set<FakeListener<LocalDatabaseRow>>();
const functionListeners = new Set<FakeListener<LocalFormulaFunction>>();

function emitDatabaseChanges(changes: FakeChange<LocalDatabase>[]): void {
  for (const listener of [...databaseListeners]) {
    listener(changes);
  }
}

function emitRowChanges(changes: FakeChange<LocalDatabaseRow>[]): void {
  for (const listener of [...rowListeners]) {
    listener(changes);
  }
}

function emitFunctionChanges(
  changes: FakeChange<LocalFormulaFunction>[]
): void {
  for (const listener of [...functionListeners]) {
    listener(changes);
  }
}

/** Fake `localDatabasesCollection` (the slice the engine + resolver read). */
export const localDatabasesCollection = {
  get: (id: string) => databases.get(id),
  subscribeChanges(listener: FakeListener<LocalDatabase>) {
    databaseListeners.add(listener);
    return { unsubscribe: () => databaseListeners.delete(listener) };
  },
  get toArray() {
    return [...databases.values()];
  },
};

/** Fake `localDatabaseRowsCollection`. */
export const localDatabaseRowsCollection = {
  get: (id: string) => rows.get(id),
  subscribeChanges(listener: FakeListener<LocalDatabaseRow>) {
    rowListeners.add(listener);
    return { unsubscribe: () => rowListeners.delete(listener) };
  },
  get toArray() {
    return [...rows.values()];
  },
};

/** Fake `localFormulaFunctionsCollection` (user-defined functions). */
export const localFormulaFunctionsCollection = {
  get: (id: string) => formulaFunctions.get(id),
  subscribeChanges(listener: FakeListener<LocalFormulaFunction>) {
    functionListeners.add(listener);
    return { unsubscribe: () => functionListeners.delete(listener) };
  },
  get toArray() {
    return [...formulaFunctions.values()];
  },
};

/** Test driver: seed state, then emit collection-shaped change events. */
export const formulaEngineFixture = {
  /** How many change subscriptions are live (0 on the server). */
  get activeSubscriptionCount(): number {
    return databaseListeners.size + rowListeners.size + functionListeners.size;
  },

  insertFunction(fn: LocalFormulaFunction): void {
    formulaFunctions.set(fn.id, fn);
    emitFunctionChanges([{ key: fn.id, type: "insert", value: fn }]);
  },

  insertRow(row: LocalDatabaseRow): void {
    rows.set(row.id, row);
    emitRowChanges([{ key: row.id, type: "insert", value: row }]);
  },

  /** The current stored copy of one row (no events). */
  row(rowId: string): LocalDatabaseRow {
    const row = rows.get(rowId);
    if (row === undefined) {
      throw new Error(`fixture: no row ${rowId}`);
    }
    return row;
  },

  removeDatabase(databaseId: string): void {
    databases.delete(databaseId);
    emitDatabaseChanges([{ key: databaseId, type: "delete" }]);
  },

  removeFunction(functionId: string): void {
    formulaFunctions.delete(functionId);
    emitFunctionChanges([{ key: functionId, type: "delete" }]);
  },

  removeRow(rowId: string): void {
    const previous = rows.get(rowId);
    rows.delete(rowId);
    emitRowChanges([
      { key: rowId, previousValue: previous, type: "delete", value: previous },
    ]);
  },

  reset(): void {
    databases.clear();
    rows.clear();
    formulaFunctions.clear();
    databaseListeners.clear();
    rowListeners.clear();
    functionListeners.clear();
  },

  /** Populate state WITHOUT events — the engine reads it at start. */
  seed(
    seedDatabases: readonly LocalDatabase[],
    seedRows: readonly LocalDatabaseRow[],
    seedFunctions: readonly LocalFormulaFunction[] = []
  ): void {
    for (const database of seedDatabases) {
      databases.set(database.id, database);
    }
    for (const row of seedRows) {
      rows.set(row.id, row);
    }
    for (const fn of seedFunctions) {
      formulaFunctions.set(fn.id, fn);
    }
  },

  updateFunction(fn: LocalFormulaFunction): void {
    const previous = formulaFunctions.get(fn.id);
    formulaFunctions.set(fn.id, fn);
    emitFunctionChanges([
      { key: fn.id, previousValue: previous, type: "update", value: fn },
    ]);
  },

  updateDatabase(database: LocalDatabase): void {
    const previous = databases.get(database.id);
    databases.set(database.id, database);
    emitDatabaseChanges([
      {
        key: database.id,
        previousValue: previous,
        type: "update",
        value: database,
      },
    ]);
  },

  /** Merge `values` into the row's cells and emit the update. */
  updateRowValues(
    rowId: string,
    values: LocalDatabaseRow["values"]
  ): LocalDatabaseRow {
    const previous = rows.get(rowId);
    if (previous === undefined) {
      throw new Error(`fixture: no row ${rowId}`);
    }
    const next = { ...previous, values: { ...previous.values, ...values } };
    rows.set(rowId, next);
    emitRowChanges([
      { key: rowId, previousValue: previous, type: "update", value: next },
    ]);
    return next;
  },
};

// --- schema/row builders --------------------------------------------------------

export function textField(id: string, name: string): DatabaseField {
  return { id, name, type: "text" };
}

export function numberField(id: string, name: string): DatabaseField {
  return { id, name, type: "number" };
}

export function formulaField(
  id: string,
  name: string,
  expression: string
): DatabaseField {
  return { expression, id, name, type: "formula" };
}

export function relationField(
  id: string,
  name: string,
  targetDatabaseId: string
): DatabaseField {
  return { id, name, targetDatabaseId, type: "relation" };
}

export function databaseOf(
  id: string,
  name: string,
  fields: DatabaseField[],
  primaryFieldId: string
): LocalDatabase {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    fields,
    id,
    name,
    primaryFieldId,
    updatedAt: "2026-01-01T00:00:00.000Z",
    views: [],
  };
}

export function rowOf(
  databaseId: string,
  id: string,
  values: LocalDatabaseRow["values"]
): LocalDatabaseRow {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    databaseId,
    id,
    updatedAt: "2026-01-01T00:00:00.000Z",
    values,
  };
}

export function functionOf(
  id: string,
  name: string,
  params: readonly string[],
  expression: string
): LocalFormulaFunction {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    expression,
    id,
    name,
    params: [...params],
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
