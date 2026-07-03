import { createTransaction } from "@tanstack/react-db";

import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { ORDER_STEP } from "@/lib/blocks/order-constants.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilterCondition,
  DatabaseFilterGroup,
  DatabaseFilterInnerGroup,
  DatabaseView,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/** Below this gap between neighboring sparse orders, midpoints stop being safe. */
const MIN_ORDER_GAP = 1e-6;

function nowIso(): string {
  return new Date().toISOString();
}

interface DatabaseTransaction {
  commit: () => Promise<unknown>;
  mutate: (callback: () => void) => void;
}

function createDatabaseTransaction(): DatabaseTransaction {
  return createTransaction({
    // Committed explicitly by `commitDatabaseTransaction`; the default
    // auto-commit would close the transaction on the first mutate().
    autoCommit: false,
    mutationFn: async ({ transaction }) => {
      localDatabasesCollection.utils.acceptMutations(transaction);
      localDatabaseRowsCollection.utils.acceptMutations(transaction);
      await Promise.resolve();
    },
  });
}

/** Commit a database transaction; surface persistence failures via toast. */
function commitDatabaseTransaction(tx: DatabaseTransaction): void {
  tx.commit().catch(reportPersistenceError);
}

function compareRowsByOrder(
  left: LocalDatabaseRow,
  right: LocalDatabaseRow
): number {
  const leftOrder = left.order;
  const rightOrder = right.order;

  if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  if (leftOrder != null && rightOrder == null) {
    return -1;
  }
  if (leftOrder == null && rightOrder != null) {
    return 1;
  }

  const byCreated = left.createdAt.localeCompare(right.createdAt);
  return byCreated === 0 ? left.id.localeCompare(right.id) : byCreated;
}

function sortedDatabaseRows(databaseId: string): LocalDatabaseRow[] {
  return localDatabaseRowsCollection.toArray
    .filter((row) => row.databaseId === databaseId)
    .sort(compareRowsByOrder);
}

interface RowOrderPlan {
  order: number;
  /** When set, sibling id → new order; applied first to restore midpoint headroom. */
  renumber?: Map<string, number>;
}

function effectiveOrder(row: LocalDatabaseRow, index: number): number {
  return row.order ?? index * ORDER_STEP;
}

/**
 * Sparse-order midpoint with renumber fallback (sidebarOrder pattern — the
 * `page-sidebar-order.ts` helpers are `PageSummary`-shaped, so the same math
 * is implemented locally for rows): halve the gap between neighbors when
 * headroom remains, otherwise renumber the whole sibling scope to
 * `index * ORDER_STEP` with a hole left at `targetIndex`.
 */
function planRowOrderAt(
  siblings: LocalDatabaseRow[],
  targetIndex: number
): RowOrderPlan {
  const previous = targetIndex > 0 ? siblings[targetIndex - 1] : undefined;
  const next =
    targetIndex < siblings.length ? siblings[targetIndex] : undefined;
  const previousOrder = previous
    ? effectiveOrder(previous, targetIndex - 1)
    : undefined;
  const nextOrder = next ? effectiveOrder(next, targetIndex) : undefined;

  if (previousOrder === undefined && nextOrder === undefined) {
    return { order: 0 };
  }
  if (previousOrder === undefined && nextOrder !== undefined) {
    return { order: nextOrder - ORDER_STEP };
  }
  if (previousOrder !== undefined && nextOrder === undefined) {
    return { order: previousOrder + ORDER_STEP };
  }
  if (previousOrder !== undefined && nextOrder !== undefined) {
    const gap = nextOrder - previousOrder;
    if (gap > MIN_ORDER_GAP) {
      return { order: previousOrder + gap / 2 };
    }
  }

  const renumber = new Map<string, number>();
  for (const [index, sibling] of siblings.entries()) {
    const slot = index < targetIndex ? index : index + 1;
    renumber.set(sibling.id, slot * ORDER_STEP);
  }
  return { order: targetIndex * ORDER_STEP, renumber };
}

/** Apply a renumber plan's sibling order updates inside an open `mutate()`. */
function applyRowOrderRenumber(plan: RowOrderPlan): void {
  if (!plan.renumber) {
    return;
  }

  for (const [rowId, order] of plan.renumber) {
    localDatabaseRowsCollection.update(rowId, (draft) => {
      draft.order = order;
    });
  }
}

/** Seed for `createDatabaseWithDefaults` — built by the pure lib-side default builder. */
export interface DatabaseSeed {
  database: LocalDatabase;
  rows: LocalDatabaseRow[];
}

/**
 * Insert a new database definition plus its seed rows in one transaction.
 * The seed comes from the pure default-builder in `lib` so this op stays a
 * thin persistence layer.
 */
export function createDatabaseWithDefaults(seed: DatabaseSeed): void {
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.insert(seed.database);
    for (const row of seed.rows) {
      localDatabaseRowsCollection.insert(row);
    }
  });

  commitDatabaseTransaction(tx);
}

/**
 * Insert a new empty row, ordered after `options.after` when given (midpoint
 * between it and its successor) or appended at the end otherwise. Returns the
 * created row so callers can focus it.
 */
export function insertDatabaseRow(
  databaseId: string,
  options?: { after?: string }
): LocalDatabaseRow {
  const siblings = sortedDatabaseRows(databaseId);
  const afterIndex = options?.after
    ? siblings.findIndex((row) => row.id === options.after)
    : -1;
  const targetIndex = afterIndex >= 0 ? afterIndex + 1 : siblings.length;
  const plan = planRowOrderAt(siblings, targetIndex);

  const timestamp = nowIso();
  const row: LocalDatabaseRow = {
    id: crypto.randomUUID(),
    databaseId,
    values: {},
    order: plan.order,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const tx = createDatabaseTransaction();
  tx.mutate(() => {
    applyRowOrderRenumber(plan);
    localDatabaseRowsCollection.insert(row);
  });
  commitDatabaseTransaction(tx);

  return row;
}

/** Merge one cell value into `row.values` and bump the row's `updatedAt`. */
export function updateDatabaseCell(
  rowId: string,
  fieldId: string,
  value: DatabaseCellValue
): void {
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabaseRowsCollection.update(rowId, (draft) => {
      draft.values = { ...draft.values, [fieldId]: value };
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
}

/** Delete rows by id in one transaction. */
export function deleteDatabaseRows(rowIds: string[]): void {
  if (rowIds.length === 0) {
    return;
  }

  const tx = createDatabaseTransaction();
  tx.mutate(() => {
    for (const rowId of rowIds) {
      localDatabaseRowsCollection.delete(rowId);
    }
  });
  commitDatabaseTransaction(tx);
}

/**
 * Move a row before/after another row by recomputing its sparse `order`
 * (midpoint between the new neighbors, renumbering the scope when the gap is
 * exhausted). With no placement given, the row moves to the end.
 */
export function reorderDatabaseRow(
  rowId: string,
  placement: { beforeRowId?: string; afterRowId?: string }
): void {
  const row = localDatabaseRowsCollection.get(rowId);
  if (!row) {
    return;
  }

  const siblings = sortedDatabaseRows(row.databaseId).filter(
    (sibling) => sibling.id !== rowId
  );

  let targetIndex = siblings.length;
  if (placement.beforeRowId) {
    const beforeIndex = siblings.findIndex(
      (sibling) => sibling.id === placement.beforeRowId
    );
    targetIndex = beforeIndex >= 0 ? beforeIndex : siblings.length;
  } else if (placement.afterRowId) {
    const afterIndex = siblings.findIndex(
      (sibling) => sibling.id === placement.afterRowId
    );
    targetIndex = afterIndex >= 0 ? afterIndex + 1 : siblings.length;
  }

  const plan = planRowOrderAt(siblings, targetIndex);
  const timestamp = nowIso();

  const tx = createDatabaseTransaction();
  tx.mutate(() => {
    applyRowOrderRenumber(plan);
    localDatabaseRowsCollection.update(rowId, (draft) => {
      draft.order = plan.order;
      draft.updatedAt = timestamp;
    });
  });
  commitDatabaseTransaction(tx);
}

/**
 * Shallow-merge a patch into the matching view (immutably rebuilding the
 * `views` array; the view id is never patched) and bump `updatedAt`.
 */
export function updateDatabaseView(
  databaseId: string,
  viewId: string,
  patch: Partial<Omit<DatabaseView, "id">>
): void {
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.views = draft.views.map((view) =>
        view.id === viewId ? { ...view, ...patch, id: view.id } : view
      );
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
}

/** Append a new field to the database schema. */
export function addDatabaseField(
  databaseId: string,
  field: DatabaseField
): void {
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.fields = [...draft.fields, field];
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
}

/** Shallow-merge a patch into the matching field (the field id is never patched). */
export function updateDatabaseField(
  databaseId: string,
  fieldId: string,
  patch: Partial<Omit<DatabaseField, "id">>
): void {
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.fields = draft.fields.map((field) =>
        field.id === fieldId
          ? // Spreading a Partial over a discriminated-union member widens the
            // type; the merged object stays a valid member because `id` is
            // pinned and patches come from field editors typed per variant.
            ({ ...field, ...patch, id: field.id } as DatabaseField)
          : field
      );
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
}

function omitRecordKey<T>(
  record: Record<string, T> | undefined,
  key: string
): Record<string, T> | undefined {
  if (!(record && key in record)) {
    return record;
  }

  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => entryKey !== key)
  );
}

function isFilterInnerGroup(
  entry: DatabaseFilterCondition | DatabaseFilterInnerGroup
): entry is DatabaseFilterInnerGroup {
  return "conditions" in entry;
}

function stripFieldFromFilter(
  filter: DatabaseFilterGroup,
  fieldId: string
): DatabaseFilterGroup | undefined {
  const nextConditions: DatabaseFilterGroup["conditions"] = [];

  for (const entry of filter.conditions) {
    if (isFilterInnerGroup(entry)) {
      const kept = entry.conditions.filter(
        (condition) => condition.fieldId !== fieldId
      );
      if (kept.length > 0) {
        nextConditions.push({ ...entry, conditions: kept });
      }
      continue;
    }

    if (entry.fieldId !== fieldId) {
      nextConditions.push(entry);
    }
  }

  if (nextConditions.length === 0) {
    return;
  }

  return { ...filter, conditions: nextConditions };
}

function stripFieldFromView(view: DatabaseView, fieldId: string): DatabaseView {
  return {
    ...view,
    visibleFieldIds: view.visibleFieldIds?.filter((id) => id !== fieldId),
    sorts: view.sorts?.filter((sort) => sort.fieldId !== fieldId),
    filter: view.filter
      ? stripFieldFromFilter(view.filter, fieldId)
      : undefined,
    config: {
      ...view.config,
      columnOrder: view.config.columnOrder?.filter((id) => id !== fieldId),
      pinnedFieldIds: view.config.pinnedFieldIds?.filter(
        (id) => id !== fieldId
      ),
      wrapFieldIds: view.config.wrapFieldIds?.filter((id) => id !== fieldId),
      columnWidths: omitRecordKey(view.config.columnWidths, fieldId),
      calculations: omitRecordKey(view.config.calculations, fieldId),
    },
  };
}

/**
 * Remove a field from the database schema, strip its values from every row of
 * the database, and drop every view reference to it (visibility, column
 * order/widths, pinning, wrap, calculations, sorts, and filter conditions —
 * inner filter groups emptied by the strip are dropped too). The primary
 * field can never be removed (every database has exactly one).
 */
export function removeDatabaseField(databaseId: string, fieldId: string): void {
  const database = localDatabasesCollection.get(databaseId);
  if (!database || database.primaryFieldId === fieldId) {
    return;
  }

  const affectedRows = localDatabaseRowsCollection.toArray.filter(
    (row) => row.databaseId === databaseId && fieldId in row.values
  );
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.fields = draft.fields.filter((field) => field.id !== fieldId);
      draft.views = draft.views.map((view) =>
        stripFieldFromView(view, fieldId)
      );
      draft.updatedAt = timestamp;
    });

    for (const row of affectedRows) {
      localDatabaseRowsCollection.update(row.id, (draft) => {
        draft.values = Object.fromEntries(
          Object.entries(draft.values).filter(([key]) => key !== fieldId)
        );
        draft.updatedAt = timestamp;
      });
    }
  });

  commitDatabaseTransaction(tx);
}

/**
 * Duplicate a field's definition (config included) under a new id named
 * "<Name> copy", inserted right after the original, and copy every row's
 * value for the source field under the new id.
 */
export function duplicateDatabaseField(
  databaseId: string,
  fieldId: string
): void {
  const database = localDatabasesCollection.get(databaseId);
  const source = database?.fields.find((field) => field.id === fieldId);
  if (!source) {
    return;
  }

  const copy: DatabaseField = {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    name: `${source.name} copy`,
  };
  const affectedRows = localDatabaseRowsCollection.toArray.filter(
    (row) => row.databaseId === databaseId && fieldId in row.values
  );
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      const sourceIndex = draft.fields.findIndex(
        (field) => field.id === fieldId
      );
      const nextFields = [...draft.fields];
      nextFields.splice(sourceIndex + 1, 0, copy);
      draft.fields = nextFields;
      draft.updatedAt = timestamp;
    });

    for (const row of affectedRows) {
      localDatabaseRowsCollection.update(row.id, (draft) => {
        draft.values = {
          ...draft.values,
          [copy.id]: draft.values[fieldId] ?? null,
        };
        draft.updatedAt = timestamp;
      });
    }
  });

  commitDatabaseTransaction(tx);
}

/** Rename a database and bump its `updatedAt`. */
export function renameDatabase(databaseId: string, name: string): void {
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.name = name;
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
}

/** Delete a database definition and all of its rows in one transaction. */
export function deleteDatabase(databaseId: string): void {
  const database = localDatabasesCollection.get(databaseId);
  const rowIds = localDatabaseRowsCollection.toArray
    .filter((row) => row.databaseId === databaseId)
    .map((row) => row.id);

  if (!database && rowIds.length === 0) {
    return;
  }

  const tx = createDatabaseTransaction();
  tx.mutate(() => {
    if (database) {
      localDatabasesCollection.delete(databaseId);
    }
    for (const rowId of rowIds) {
      localDatabaseRowsCollection.delete(rowId);
    }
  });
  commitDatabaseTransaction(tx);
}
