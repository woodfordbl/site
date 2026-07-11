import { createTransaction } from "@tanstack/react-db";

import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { clearDatabaseFieldHistory } from "@/db/history/field-history-store.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { ORDER_STEP } from "@/lib/blocks/order-constants.ts";
import { recordShippedDatabaseTombstone } from "@/lib/databases/shipped-database-tombstones.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilterCondition,
  DatabaseFilterGroup,
  DatabaseFilterInnerGroup,
  DatabaseSource,
  DatabaseTableViewConfig,
  DatabaseView,
  DatabaseViewType,
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
 * Shipped-content deploy update: swap an UNEDITED seeded database for the new
 * shipped version in one transaction (definition + full row set). Never call
 * this for user-edited copies — the seeder's action resolver guards that.
 * Bypasses `deleteDatabase` deliberately: this is not a user deletion, so no
 * shipped tombstone is recorded and field history is kept.
 */
export function replaceShippedDatabase(seed: DatabaseSeed): void {
  const existing = localDatabasesCollection.get(seed.database.id);
  const staleRowIds = localDatabaseRowsCollection.toArray
    .filter((row) => row.databaseId === seed.database.id)
    .map((row) => row.id);

  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    if (existing) {
      localDatabasesCollection.delete(seed.database.id);
    }
    for (const rowId of staleRowIds) {
      localDatabaseRowsCollection.delete(rowId);
    }
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

/**
 * Merge one cell value into `row.values` and bump the row's `updatedAt`.
 *
 * A missing row is a silent no-op: the row can vanish between the editor
 * opening and the commit (sync-engine tombstone in this or another tab,
 * cross-tab delete), and `collection.update` on a missing key throws inside
 * `mutate()` — an uncaught error in the blur handler with no persistence
 * toast. The row is gone either way; the edit has nowhere to land.
 */
export function updateDatabaseCell(
  rowId: string,
  fieldId: string,
  value: DatabaseCellValue
): void {
  if (!localDatabaseRowsCollection.get(rowId)) {
    return;
  }

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

/**
 * Delete rows by id in one transaction. Rows carrying an `externalId`
 * (written by the connector sync engine) are skipped: locally deleting a
 * synced row is dishonest UX — the next sync pass would simply respawn it
 * from the provider snapshot — so v1 disables synced-row deletion at the op
 * level. Whole-database deletion (`deleteDatabase`) still removes synced
 * rows, and the sync engine's own tombstone path never goes through here.
 *
 * Ids with no matching row are skipped too (stale selection, double-fire,
 * cross-tab delete): `collection.delete` on a missing key throws mid-
 * transaction, which would strand earlier deletes as uncommitted optimistic
 * state.
 */
export function deleteDatabaseRows(rowIds: string[]): void {
  const deletable = rowIds.filter((rowId) => {
    const row = localDatabaseRowsCollection.get(rowId);
    return row !== undefined && row.externalId === undefined;
  });
  if (deletable.length === 0) {
    return;
  }

  const tx = createDatabaseTransaction();
  tx.mutate(() => {
    for (const rowId of deletable) {
      localDatabaseRowsCollection.delete(rowId);
    }
  });
  commitDatabaseTransaction(tx);
}

/**
 * Duplicate local rows by id: clones `values`, assigns new ids, and inserts
 * each copy after its source sibling (document order). Synced rows
 * (`externalId`) and missing ids are skipped — copies never inherit
 * `externalId` or `pageId`. Returns the inserted rows in the same order as
 * the source ids that were duplicated.
 * @see docs/architecture/databases.md#table-view
 */
export function duplicateDatabaseRows(rowIds: string[]): LocalDatabaseRow[] {
  const sources: LocalDatabaseRow[] = [];
  for (const rowId of rowIds) {
    const row = localDatabaseRowsCollection.get(rowId);
    if (row && row.externalId === undefined) {
      sources.push(row);
    }
  }
  if (sources.length === 0) {
    return [];
  }

  // Group by database so each insert plans against that DB's sibling list.
  // Within a database, process in current sibling order and always insert
  // after the source (or its running copy), so multi-select keeps relative order.
  const byDatabase = new Map<string, LocalDatabaseRow[]>();
  for (const source of sources) {
    const group = byDatabase.get(source.databaseId) ?? [];
    group.push(source);
    byDatabase.set(source.databaseId, group);
  }

  const createdBySourceId = new Map<string, LocalDatabaseRow>();
  const timestamp = nowIso();

  const tx = createDatabaseTransaction();
  tx.mutate(() => {
    for (const [databaseId, group] of byDatabase) {
      const siblingOrder = new Map(
        sortedDatabaseRows(databaseId).map((row, index) => [row.id, index])
      );
      const ordered = [...group].sort(
        (left, right) =>
          (siblingOrder.get(left.id) ?? 0) - (siblingOrder.get(right.id) ?? 0)
      );

      for (const source of ordered) {
        // Insert immediately after the source so multi-select copies stack in
        // document order beside their originals.
        const siblings = sortedDatabaseRows(databaseId);
        const afterIndex = siblings.findIndex((row) => row.id === source.id);
        const targetIndex = afterIndex >= 0 ? afterIndex + 1 : siblings.length;
        const plan = planRowOrderAt(siblings, targetIndex);
        applyRowOrderRenumber(plan);

        const copy: LocalDatabaseRow = {
          id: crypto.randomUUID(),
          databaseId,
          values: { ...source.values },
          order: plan.order,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        localDatabaseRowsCollection.insert(copy);
        createdBySourceId.set(source.id, copy);
      }
    }
  });
  commitDatabaseTransaction(tx);

  // Preserve the caller's id order for return (skip sources that were filtered).
  return rowIds.flatMap((rowId) => {
    const copy = createdBySourceId.get(rowId);
    return copy ? [copy] : [];
  });
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
 * Deep-copy a draft value into plain objects. TanStack DB update drafts are
 * change-tracking proxies; spreading them into the stored document makes zod
 * v4's `z.record` validation reject the NEXT write ("expected record,
 * received object") once a record key (calculations, columnWidths) exists.
 * A JSON round-trip flattens every nested proxy — database documents are
 * JSON-safe by schema.
 */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Shallow-merge a patch into the matching view (immutably rebuilding the
 * `views` array from plain data; the view id is never patched) and bump
 * `updatedAt`. Keys explicitly passed as `undefined` are REMOVED from the
 * view — `toPlain`'s JSON round-trip drops undefined-valued keys, so a plain
 * spread could never unset an optional view key (`groupBy`, `sorts`,
 * `filter`).
 */
export function updateDatabaseView(
  databaseId: string,
  viewId: string,
  patch: Partial<Omit<DatabaseView, "id">>
): void {
  const timestamp = nowIso();
  const clearedKeys = Object.keys(patch).filter(
    (key) => patch[key as keyof typeof patch] === undefined
  );
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.views = toPlain(draft.views).map((view) => {
        if (view.id !== viewId) {
          return view;
        }
        const merged = { ...view, ...toPlain(patch), id: view.id };
        if (clearedKeys.length === 0) {
          return merged;
        }
        return Object.fromEntries(
          Object.entries(merged).filter(([key]) => !clearedKeys.includes(key))
        ) as typeof merged;
      });
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
}

/** Default view names per type; deduped with a numeric suffix on collision. */
const VIEW_TYPE_DEFAULT_NAMES: Record<DatabaseViewType, string> = {
  table: "Table",
  list: "List",
  board: "Board",
  chart: "Chart",
};

/**
 * `base` when free, else the first free `base 2`, `base 3`, … among the
 * database's existing view names (exact match, case-sensitive — cheap and
 * predictable; a rename can always create a duplicate on purpose).
 */
function dedupeViewName(
  views: readonly { name: string }[],
  base: string
): string {
  const taken = new Set(views.map((view) => view.name));
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base} ${suffix}`)) {
    suffix += 1;
  }
  return `${base} ${suffix}`;
}

/**
 * Per-type starting config for a fresh view: `table`/`list` start empty;
 * `board` picks the first select field as the column source when one exists
 * (multiSelect can't be a kanban lane — a card would sit in several columns);
 * `chart` starts as a bar chart counting rows over the first select or date
 * field. All picks are optional — the view editors handle the unset state.
 */
function defaultViewConfig(
  type: DatabaseViewType,
  fields: readonly DatabaseField[]
): DatabaseTableViewConfig {
  if (type === "board") {
    const groupField = fields.find((field) => field.type === "select");
    return groupField ? { board: { groupFieldId: groupField.id } } : {};
  }
  if (type === "chart") {
    const xField = fields.find(
      (field) => field.type === "select" || field.type === "date"
    );
    return {
      chart: { mark: "bar", xFieldId: xField?.id, yAggregate: "count" },
    };
  }
  return {};
}

/**
 * Append a new saved view of the given type (default per-type config, name
 * defaulting to the type label with a dedupe suffix) and bump `updatedAt`.
 * Returns the created view so callers can activate it, or `undefined` when
 * the database doesn't exist.
 */
export function addDatabaseView(
  databaseId: string,
  options: { type: DatabaseViewType; name?: string }
): DatabaseView | undefined {
  const database = localDatabasesCollection.get(databaseId);
  if (!database) {
    return;
  }

  const view: DatabaseView = {
    id: crypto.randomUUID(),
    name: dedupeViewName(
      database.views,
      options.name ?? VIEW_TYPE_DEFAULT_NAMES[options.type]
    ),
    type: options.type,
    // toPlain: drop undefined-valued keys (e.g. an unset chart xFieldId) so
    // the stored document never carries explicit `undefined`s.
    config: toPlain(defaultViewConfig(options.type, database.fields)),
  };
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.views = [...toPlain(draft.views), view];
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
  return view;
}

/**
 * Remove a saved view. Refuses to remove the LAST view — a database must
 * always keep at least one view (blocks resolve `viewId ?? views[0]`, so an
 * empty `views` array would dead-end every linked block). Unknown ids no-op.
 */
export function removeDatabaseView(databaseId: string, viewId: string): void {
  const database = localDatabasesCollection.get(databaseId);
  if (
    !database ||
    database.views.length <= 1 ||
    !database.views.some((view) => view.id === viewId)
  ) {
    return;
  }

  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.views = toPlain(draft.views).filter((view) => view.id !== viewId);
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
}

/**
 * Duplicate a saved view (deep config copy) under a new id named
 * "<Name> copy", inserted right after the original. Returns the copy so
 * callers can activate it, or `undefined` when the view doesn't exist.
 */
export function duplicateDatabaseView(
  databaseId: string,
  viewId: string
): DatabaseView | undefined {
  const database = localDatabasesCollection.get(databaseId);
  const source = database?.views.find((view) => view.id === viewId);
  if (!source) {
    return;
  }

  const copy: DatabaseView = {
    // toPlain: the source may hold nested proxies from a prior draft merge;
    // the copy must be plain data (and deep-copied — shared filter/config
    // objects would make edits in one view leak into the other).
    ...toPlain(source),
    id: crypto.randomUUID(),
    name: `${source.name} copy`,
  };
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      const views = toPlain(draft.views);
      const sourceIndex = views.findIndex((view) => view.id === viewId);
      views.splice(sourceIndex + 1, 0, copy);
      draft.views = views;
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
  return copy;
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
    groupBy: view.groupBy?.fieldId === fieldId ? undefined : view.groupBy,
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
      draft.views = toPlain(draft.views).map((view) =>
        // The draft's view type keeps `config` optional (schema input side of
        // the `.default({})`); normalize before stripping references.
        stripFieldFromView({ ...view, config: view.config ?? {} }, fieldId)
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
 * Remap select/multiSelect option ids in a copied cell value through the
 * duplicate field's old→new option-id map. Ids without a mapping (already
 * stale in the source cell) are kept as-is — they render as stale in the
 * copy exactly as they did in the original.
 */
function remapOptionIds(
  value: DatabaseCellValue,
  optionIdMap: Map<string, string>
): DatabaseCellValue {
  if (optionIdMap.size === 0) {
    return value;
  }
  if (typeof value === "string") {
    return optionIdMap.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((id) => optionIdMap.get(id) ?? id);
  }
  return value;
}

/**
 * Duplicate a field's definition (config included) under a new id named
 * "<Name> copy", inserted right after the original, and copy every row's
 * value for the source field under the new id. `sourceKey` is deliberately
 * stripped: duplicating a synced column yields a LOCAL field with the current
 * values copied — the copy must never be adopted (and overwritten) by the
 * sync engine.
 *
 * Select/multiSelect copies get FRESH option ids (option ids are assumed
 * unique across all databases — e.g. the cell editor's recolor helper looks
 * fields up by option id alone), with copied row values remapped through the
 * old→new id map in the same transaction.
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

  // Rest-destructure `sourceKey` away (the linter bans `delete`) so the copy
  // carries no provider binding at all.
  const { sourceKey: _sourceKey, ...cloned } = structuredClone(source);
  const optionIdMap = new Map<string, string>();
  if (cloned.type === "select" || cloned.type === "multiSelect") {
    cloned.options = cloned.options.map((option) => {
      const nextId = crypto.randomUUID();
      optionIdMap.set(option.id, nextId);
      return { ...option, id: nextId };
    });
  }
  const copy = {
    ...cloned,
    id: crypto.randomUUID(),
    name: `${source.name} copy`,
  } as DatabaseField;
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
        // toPlain: the copied value may be a nested draft proxy (multiSelect
        // arrays) — never store proxies in the document.
        const copied = toPlain(draft.values[fieldId] ?? null);
        draft.values = {
          ...draft.values,
          [copy.id]: remapOptionIds(copied, optionIdMap),
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

/**
 * Set (or clear, with `undefined`) a database's icon — an emoji or
 * `tabler:IconName`, matching page icons — and bump its `updatedAt`.
 */
export function setDatabaseIcon(
  databaseId: string,
  icon: string | undefined
): void {
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.icon = icon;
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
}

/**
 * Rebuild the database's `fields` array in the given id order, in one
 * transaction, bumping `updatedAt`. Ids are validated against the existing
 * schema: unknown ids are ignored (as are duplicates after the first), and
 * fields missing from `orderedFieldIds` are appended in their prior relative
 * order — the schema can never lose or gain fields through a reorder.
 */
export function reorderDatabaseFields(
  databaseId: string,
  orderedFieldIds: string[]
): void {
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      // The draft's field type is the schema's input side (e.g. select
      // `options` pre-`.default([])`), so reuse it rather than `DatabaseField`.
      const byId = new Map(draft.fields.map((field) => [field.id, field]));
      const ordered: typeof draft.fields = [];
      const used = new Set<string>();

      for (const fieldId of orderedFieldIds) {
        const field = byId.get(fieldId);
        if (field && !used.has(fieldId)) {
          ordered.push(field);
          used.add(fieldId);
        }
      }
      for (const field of draft.fields) {
        if (!used.has(field.id)) {
          ordered.push(field);
        }
      }

      draft.fields = ordered;
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
}

/** The connector variant of `DatabaseSource` (the only editable one). */
type ConnectorDatabaseSource = Extract<DatabaseSource, { kind: "connector" }>;

/**
 * Patch a connector database's `source` (refresh-interval override, edited
 * config) and bump `updatedAt`. Only databases whose source is already
 * `kind: "connector"` are patched — local databases have no source settings.
 * Passing `refreshMs: undefined` removes the override so the connector's
 * default cadence applies again (connectors still clamp any override to
 * their own minimum). The sync engine subscribes to the databases
 * collection, so a saved patch reschedules polling automatically.
 */
export function updateDatabaseSource(
  databaseId: string,
  patch: Partial<Omit<ConnectorDatabaseSource, "kind">>
): void {
  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      if (draft.source?.kind !== "connector") {
        return;
      }
      // `toPlain` drops keys whose value is undefined, so the explicit
      // "clear the refresh override" case rebuilds the source without the
      // key via rest-destructuring (the linter bans `delete`).
      // The draft's deep-writable mapping degrades the recursive JsonValue
      // config to `unknown`; the runtime shape is the validated source.
      const merged: ConnectorDatabaseSource = {
        ...(toPlain(draft.source) as ConnectorDatabaseSource),
        ...toPlain(patch),
        kind: "connector",
      };
      if ("refreshMs" in patch && patch.refreshMs === undefined) {
        const { refreshMs: _cleared, ...withoutOverride } = merged;
        draft.source = withoutOverride;
      } else {
        draft.source = merged;
      }
      draft.updatedAt = timestamp;
    });
  });

  commitDatabaseTransaction(tx);
}

/**
 * Link a row to its lazily-materialized page: set `row.pageId` and bump
 * `updatedAt`. This is the copy-on-write commit point for rows-as-pages —
 * the id references a REAL user page created from the database's row
 * template (see `lib/databases/row-template.ts`); until this runs the row's
 * page exists only virtually. v1 never CLEARS a link — callers only invoke
 * this from the virtual state (pageId unset, or dangling after the target
 * page was deleted, which the row route treats as virtual again).
 * Unlink/cascade semantics land with the page-delete integration
 * (databases proposal §2.5).
 *
 * Synced rows (carrying an `externalId`) are refused as a no-op: "synced
 * rows never get pages" is a schema invariant (`schemas/database.ts`) — the
 * sync engine tombstones such rows when they leave the provider snapshot,
 * which would strand the linked page with no back-link, and a reappearing
 * record gets a brand-new row id, silently severing the association. The
 * row-page UI hides page materialization for synced rows; this guard is the
 * op-level enforcement.
 */
export function setDatabaseRowPageId(rowId: string, pageId: string): void {
  const row = localDatabaseRowsCollection.get(rowId);
  if (!row || row.externalId !== undefined) {
    return;
  }

  const timestamp = nowIso();
  const tx = createDatabaseTransaction();

  tx.mutate(() => {
    localDatabaseRowsCollection.update(rowId, (draft) => {
      draft.pageId = pageId;
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

  // A seeded shipped database must stay deleted — without a tombstone the
  // shipped-content seeder would resurrect it at the next boot.
  if (database?.serverBaselineHash != null) {
    recordShippedDatabaseTombstone(databaseId);
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

  // Best-effort: drop the database's captured field history (IndexedDB) so it
  // doesn't leak after the table is gone. Derived data — failures are non-fatal.
  clearDatabaseFieldHistory(databaseId).catch(reportPersistenceError);
}
