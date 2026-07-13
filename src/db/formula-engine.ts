import { useCallback, useSyncExternalStore } from "react";

import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import type {
  FormulaCellResult,
  FormulaOverlay,
} from "@/lib/databases/formula-values.ts";
import type {
  FormulaRelationDatabase,
  FormulaRelationResolver,
} from "@/lib/formula/values.ts";
import {
  addFormulaDirtyRows,
  FORMULA_ALL_ROWS,
  type FormulaDirtyMap,
  formulaClockTick,
  formulaDataCellChanged,
  formulaRelationCellChanged,
  formulaRowAdded,
  formulaRowRemoved,
  formulaSchemaChanged,
} from "@/lib/formula-engine/dirty.ts";
import {
  evaluateDirtyFormulas,
  evictFormulaCacheRow,
  type FormulaRowsSnapshot,
  type FormulaValueCache,
} from "@/lib/formula-engine/evaluate-dirty.ts";
import {
  buildFormulaGraph,
  type FormulaGraph,
  type FormulaGraphDatabase,
} from "@/lib/formula-engine/graph.ts";
import {
  buildFormulaReverseIndexes,
  type FormulaReverseIndexes,
  relationCellTargetIds,
} from "@/lib/formula-engine/reverse-index.ts";
import type {
  DatabaseCellValue,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * The stateful formula engine (proposal §5.2, stage P3.3b): a browser-only
 * module singleton that subscribes to the local databases/rows collections,
 * feeds the pure incremental core (`src/lib/formula-engine/`), owns the value
 * cache, and serves per-database {@link FormulaOverlay} snapshots to React
 * via `useSyncExternalStore` ({@link useFormulaOverlay}).
 *
 * **Lifecycle** — created lazily on the first subscriber, never on the server
 * (`subscribe` no-ops without `window`; the server snapshot is a shared empty
 * overlay). On start it mirrors both collections, builds the column graph and
 * reverse indexes, marks every formula column {@link FORMULA_ALL_ROWS} dirty,
 * and runs one full **warm pass**. The warm-cache invariant: the incremental
 * evaluator reads non-dirty same-row dependencies straight from the cache, so
 * the cache must be fully populated before any incremental pass runs. Once
 * started the engine stays alive (HMR disposes and lazily restarts it).
 *
 * **Events** — row updates diff old/new cell values per field (relation
 * fields as relation-cell changes carrying old/new target ids, everything
 * else as data-cell changes); inserts/removals map to the core's row events,
 * removal also evicting the row's cached cells (the core deliberately does
 * not evict). Any databases-collection change is a coarse schema change:
 * rebuild the graph + reverse indexes, prune cached cells for columns that no
 * longer exist, and mark the changed databases (and inbound traversers) fully
 * dirty. Synchronous event bursts coalesce into one evaluation pass via a
 * queued microtask; only affected databases' subscribers are notified.
 *
 * **Resolver** — evaluation passes read cross-database data through the
 * engine's own mirrors, and `formulaValue` reads the ENGINE CACHE directly.
 * It never falls back to `localFormulaRelationResolver`: an on-demand
 * recompute would bypass the graph's static cycle guard and re-derive values
 * the cache already holds (possibly stale mid-pass). That resolver stays for
 * the one-shot pure paths (editor preview, templates).
 *
 * **Clock** — the engine owns the 60s volatile tick (`now()`/`today()`),
 * running only while subscribers exist and the tab is visible (immediate
 * refresh on return, mirroring the table view's display clock). Each pass
 * evaluates against a single captured instant.
 */

/** Refresh cadence for volatile (`now()`/`today()`) formula columns. */
const FORMULA_CLOCK_REFRESH_MS = 60_000;

/**
 * The shared empty overlay: server snapshot, pre-start client snapshot, and
 * the stable result for databases with no formula columns.
 */
export const EMPTY_FORMULA_OVERLAY: FormulaOverlay = new Map();

interface FormulaEngineState {
  /** The value cache the pure evaluator fills; the overlay projects from it. */
  cache: FormulaValueCache;
  /** Schema mirror, updated from databases-collection change events. */
  databases: Map<string, LocalDatabase>;
  /** Pending dirty marks, consumed by the next evaluation pass. */
  dirty: FormulaDirtyMap;
  flushScheduled: boolean;
  graph: FormulaGraph;
  indexes: FormulaReverseIndexes;
  intervalId: number | undefined;
  /** Materialized per-database overlays, valid while their version matches. */
  overlays: Map<string, { overlay: FormulaOverlay; version: number }>;
  /** Databases whose overlay changed outside evaluation (evictions, prunes). */
  pendingNotify: Set<string>;
  /** Rows mirror: databaseId → rowId → row. */
  rows: Map<string, Map<string, LocalDatabaseRow>>;
  subscriptions: { unsubscribe(): void }[];
  /** Per-database overlay version; bumps invalidate the materialized map. */
  versions: Map<string, number>;
}

let state: FormulaEngineState | null = null;
const listeners = new Map<string, Set<() => void>>();
let subscriberCount = 0;
let evaluationObserver:
  | ((databaseId: string, fieldId: string, rowId: string) => void)
  | null = null;

/**
 * Observe every real (column, row) evaluation the engine performs — tests
 * assert evaluation COUNTS (dirty precision) instead of wall-clock. Pass
 * `null` to detach.
 */
export function observeFormulaEvaluationsForTests(
  observer:
    | ((databaseId: string, fieldId: string, rowId: string) => void)
    | null
): void {
  evaluationObserver = observer;
}

// --- mirrors and snapshots -----------------------------------------------------

function rowsMapOf(
  engine: FormulaEngineState,
  databaseId: string
): Map<string, LocalDatabaseRow> {
  let rows = engine.rows.get(databaseId);
  if (rows === undefined) {
    rows = new Map();
    engine.rows.set(databaseId, rows);
  }
  return rows;
}

/** The row as the engine last saw it, searching every database's mirror. */
function findEngineRow(
  engine: FormulaEngineState,
  rowId: string
): LocalDatabaseRow | undefined {
  for (const rows of engine.rows.values()) {
    const row = rows.get(rowId);
    if (row !== undefined) {
      return row;
    }
  }
  return;
}

function engineSnapshotOf(engine: FormulaEngineState): FormulaRowsSnapshot {
  return {
    row: (databaseId, rowId) => engine.rows.get(databaseId)?.get(rowId),
    rows: (databaseId) => [...(engine.rows.get(databaseId)?.values() ?? [])],
  };
}

/**
 * The evaluation resolver: `database()` reads the engine's live mirrors
 * (cached per pass), and `formulaValue` reads the ENGINE CACHE only. A cache
 * miss is `null` (blank) — safe post-warm: the warm pass populated every
 * (formula column, row) cell, incremental passes evaluate dependencies
 * before dependents in topological order, and a genuine miss means the
 * target row or field no longer exists, which is exactly the stale-ref
 * blank semantics. Falling back to an on-demand recompute would bypass the
 * graph's static cycle guard and re-derive values mid-pass.
 */
function engineResolverOf(engine: FormulaEngineState): FormulaRelationResolver {
  const entries = new Map<string, FormulaRelationDatabase | null>();
  return {
    database(databaseId) {
      const cached = entries.get(databaseId);
      if (cached !== undefined) {
        return cached;
      }
      const database = engine.databases.get(databaseId);
      const rowsById = engine.rows.get(databaseId);
      const entry =
        database === undefined
          ? null
          : {
              fields: database.fields,
              name: database.name,
              primaryFieldId: database.primaryFieldId,
              row: (rowId: string) => rowsById?.get(rowId)?.values ?? null,
            };
      entries.set(databaseId, entry);
      return entry;
    },
    formulaValue: (databaseId, rowId, fieldId) =>
      engine.cache.get(databaseId)?.get(rowId)?.get(fieldId)?.value ?? null,
    // Whole-database `db("…")` enumeration off the same mirrors the engine
    // already keeps for its reverse indexes: a known database with no rows
    // is the empty list, an unknown id is null (the unknown-database error).
    rowIds: (databaseId) => {
      if (!engine.databases.has(databaseId)) {
        return null;
      }
      const rows = engine.rows.get(databaseId);
      return rows === undefined ? [] : [...rows.keys()];
    },
  };
}

// --- graph rebuild ---------------------------------------------------------------

function formulaGraphDatabasesOf(
  databases: ReadonlyMap<string, LocalDatabase>
): Map<string, FormulaGraphDatabase> {
  const slices = new Map<string, FormulaGraphDatabase>();
  for (const [databaseId, database] of databases) {
    slices.set(databaseId, { fields: database.fields, name: database.name });
  }
  return slices;
}

/**
 * Drop cached cells for formula columns the rebuilt graph no longer has
 * (deleted fields, fields that stopped being formulas, deleted databases) —
 * without this the overlay would keep serving values for dead columns.
 */
function pruneEngineCache(engine: FormulaEngineState): void {
  for (const [databaseId, databaseCache] of engine.cache) {
    const allowed = new Set(
      (engine.graph.columnsByDatabase.get(databaseId) ?? []).map(
        (column) => column.fieldId
      )
    );
    for (const [rowId, rowCache] of databaseCache) {
      for (const fieldId of [...rowCache.keys()]) {
        if (!allowed.has(fieldId)) {
          rowCache.delete(fieldId);
          engine.pendingNotify.add(databaseId);
        }
      }
      if (rowCache.size === 0) {
        databaseCache.delete(rowId);
      }
    }
    if (databaseCache.size === 0) {
      engine.cache.delete(databaseId);
    }
  }
}

/** Rebuild the column graph and reverse indexes from the current mirrors. */
function rebuildEngineGraph(engine: FormulaEngineState): void {
  engine.graph = buildFormulaGraph(formulaGraphDatabasesOf(engine.databases));
  engine.indexes = buildFormulaReverseIndexes(engine.graph, (databaseId) => {
    const rows = engine.rows.get(databaseId);
    return rows === undefined ? undefined : [...rows.values()];
  });
  pruneEngineCache(engine);
}

// --- evaluation passes -------------------------------------------------------------

function notifyFormulaListeners(databaseIds: ReadonlySet<string>): void {
  for (const databaseId of databaseIds) {
    const set = listeners.get(databaseId);
    if (set === undefined) {
      continue;
    }
    for (const listener of [...set]) {
      listener();
    }
  }
}

/**
 * Evaluate everything currently dirty in one pass (single captured instant),
 * bump the affected databases' overlay versions, and notify exactly their
 * subscribers. Affected = databases owning an initially-dirty column, plus
 * every database a re-evaluation actually touched (`onEvaluate` — required
 * because dirtiness PROPAGATED during the pass, e.g. a Tasks edit reaching a
 * Projects rollup through a graph edge, is consumed inside
 * `evaluateDirtyFormulas` and never visible in the pre-pass dirty map), plus
 * databases whose cache changed outside evaluation (`pendingNotify`).
 */
function runEvaluationPass(engine: FormulaEngineState): void {
  const affected = new Set(engine.pendingNotify);
  engine.pendingNotify.clear();
  for (const key of engine.dirty.keys()) {
    const column = engine.graph.columns.get(key);
    if (column !== undefined) {
      affected.add(column.databaseId);
    }
  }
  if (engine.dirty.size > 0) {
    const instant = new Date();
    evaluateDirtyFormulas(
      engine.graph,
      engine.dirty,
      engine.cache,
      engineSnapshotOf(engine),
      engine.indexes,
      {
        now: () => instant,
        onEvaluate: (databaseId, fieldId, rowId) => {
          affected.add(databaseId);
          evaluationObserver?.(databaseId, fieldId, rowId);
        },
        relations: engineResolverOf(engine),
      }
    );
  }
  if (affected.size === 0) {
    return;
  }
  for (const databaseId of affected) {
    engine.versions.set(databaseId, (engine.versions.get(databaseId) ?? 0) + 1);
  }
  notifyFormulaListeners(affected);
}

/** Coalesce a synchronous event burst into one evaluation pass. */
function scheduleEngineFlush(engine: FormulaEngineState): void {
  if (engine.flushScheduled) {
    return;
  }
  engine.flushScheduled = true;
  queueMicrotask(() => {
    engine.flushScheduled = false;
    if (state === engine) {
      runEvaluationPass(engine);
    }
  });
}

// --- collection event mapping --------------------------------------------------------

/** Cell equality for the update diff (relation/multiSelect cells are arrays). */
function cellValuesEqual(
  a: DatabaseCellValue | undefined,
  b: DatabaseCellValue | undefined
): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => item === right[index])
    );
  }
  return left === right;
}

/**
 * Map one row update to per-field dirty events: relation fields carry their
 * old/new target-id lists (the reverse index diffs on them), every other
 * changed field — including ids absent from the schema, whose columns may
 * reference them as unresolved refs — is a plain data-cell change.
 */
function diffEngineRowValues(
  engine: FormulaEngineState,
  previous: LocalDatabaseRow,
  next: LocalDatabaseRow
): void {
  const fields = engine.databases.get(next.databaseId)?.fields;
  const fieldIds = new Set([
    ...Object.keys(previous.values),
    ...Object.keys(next.values),
  ]);
  for (const fieldId of fieldIds) {
    const before = previous.values[fieldId];
    const after = next.values[fieldId];
    if (cellValuesEqual(before, after)) {
      continue;
    }
    const field = fields?.find((candidate) => candidate.id === fieldId);
    const event = { databaseId: next.databaseId, fieldId, rowId: next.id };
    if (field?.type === "relation") {
      formulaRelationCellChanged(engine.graph, engine.indexes, engine.dirty, {
        ...event,
        newTargetIds: relationCellTargetIds(after),
        oldTargetIds: relationCellTargetIds(before),
      });
    } else {
      formulaDataCellChanged(engine.graph, engine.indexes, engine.dirty, event);
    }
  }
}

function insertEngineRow(
  engine: FormulaEngineState,
  row: LocalDatabaseRow
): void {
  rowsMapOf(engine, row.databaseId).set(row.id, row);
  formulaRowAdded(engine.graph, engine.indexes, engine.dirty, {
    databaseId: row.databaseId,
    rowId: row.id,
    values: row.values,
  });
}

/**
 * Row removal dirties referrers and drops the row's outgoing links (the
 * core), then EVICTS the row's cached cells — the core deliberately never
 * evicts, so skipping this would leave ghost overlay entries forever.
 */
function removeEngineRow(
  engine: FormulaEngineState,
  row: LocalDatabaseRow
): void {
  formulaRowRemoved(engine.graph, engine.indexes, engine.dirty, {
    databaseId: row.databaseId,
    rowId: row.id,
    values: row.values,
  });
  if (engine.cache.get(row.databaseId)?.has(row.id)) {
    engine.pendingNotify.add(row.databaseId);
  }
  evictFormulaCacheRow(engine.cache, row.databaseId, row.id);
  engine.rows.get(row.databaseId)?.delete(row.id);
}

interface EngineRowChange {
  key: string | number;
  type: "delete" | "insert" | "update";
  value?: LocalDatabaseRow;
}

/**
 * One rows-collection change. The PREVIOUS row always comes from the
 * engine's own mirror (not the message's `previousValue`) so diffs are
 * consistent with what the engine last evaluated against.
 */
function applyRowChange(
  engine: FormulaEngineState,
  change: EngineRowChange
): void {
  if (change.type === "delete") {
    const previous = findEngineRow(engine, String(change.key)) ?? change.value;
    if (previous !== undefined) {
      removeEngineRow(engine, previous);
    }
    return;
  }
  const next = change.value;
  if (next === undefined) {
    return;
  }
  const previous = findEngineRow(engine, next.id);
  if (previous === undefined) {
    insertEngineRow(engine, next);
    return;
  }
  if (previous.databaseId !== next.databaseId) {
    removeEngineRow(engine, previous);
    insertEngineRow(engine, next);
    return;
  }
  rowsMapOf(engine, next.databaseId).set(next.id, next);
  diffEngineRowValues(engine, previous, next);
}

function handleRowChanges(changes: readonly EngineRowChange[]): void {
  const engine = state;
  if (engine === null) {
    return;
  }
  for (const change of changes) {
    applyRowChange(engine, change);
  }
  scheduleEngineFlush(engine);
}

interface EngineDatabaseChange {
  key: string | number;
  type: "delete" | "insert" | "update";
  value?: LocalDatabase;
}

/**
 * Any databases-collection change is the coarse schema path: update the
 * mirror, rebuild graph + reverse indexes (synchronously, so row events
 * later in the same burst see the new graph), and mark every changed
 * database — plus columns traversing into it — fully dirty.
 */
function handleDatabaseChanges(changes: readonly EngineDatabaseChange[]): void {
  const engine = state;
  if (engine === null) {
    return;
  }
  const changedIds = new Set<string>();
  for (const change of changes) {
    if (change.type === "delete") {
      const databaseId = String(change.key);
      engine.databases.delete(databaseId);
      changedIds.add(databaseId);
      continue;
    }
    const database = change.value;
    if (database !== undefined) {
      engine.databases.set(database.id, database);
      changedIds.add(database.id);
    }
  }
  rebuildEngineGraph(engine);
  for (const databaseId of changedIds) {
    formulaSchemaChanged(engine.graph, engine.dirty, databaseId);
  }
  scheduleEngineFlush(engine);
}

// --- clock -------------------------------------------------------------------------

/** One volatile tick: mark volatile columns and evaluate synchronously. */
function clockTick(): void {
  const engine = state;
  if (engine === null) {
    return;
  }
  let hasVolatileColumn = false;
  for (const column of engine.graph.columns.values()) {
    if (column.volatile) {
      hasVolatileColumn = true;
      break;
    }
  }
  if (!hasVolatileColumn) {
    return;
  }
  formulaClockTick(engine.graph, engine.dirty);
  runEvaluationPass(engine);
}

/** Run the interval only while subscribers exist and the tab is visible. */
function updateFormulaClock(): void {
  const engine = state;
  if (engine === null) {
    return;
  }
  const visible = typeof document === "undefined" || !document.hidden;
  if (subscriberCount > 0 && visible) {
    if (engine.intervalId === undefined) {
      engine.intervalId = window.setInterval(
        clockTick,
        FORMULA_CLOCK_REFRESH_MS
      );
    }
    return;
  }
  if (engine.intervalId !== undefined) {
    window.clearInterval(engine.intervalId);
    engine.intervalId = undefined;
  }
}

function handleVisibilityChange(): void {
  if (typeof document !== "undefined" && !document.hidden) {
    // Volatile cells refreshed immediately on return, like the view clock.
    clockTick();
  }
  updateFormulaClock();
}

// --- lifecycle ----------------------------------------------------------------------

/**
 * Lazily create the singleton: mirror both collections, subscribe to their
 * change streams, build graph + indexes, and run the full warm pass
 * (everything {@link FORMULA_ALL_ROWS} dirty). Never runs on the server.
 */
function ensureFormulaEngineStarted(): void {
  if (state !== null || typeof window === "undefined") {
    return;
  }
  const engine: FormulaEngineState = {
    cache: new Map(),
    databases: new Map(),
    dirty: new Map(),
    flushScheduled: false,
    graph: buildFormulaGraph(new Map()),
    indexes: new Map(),
    intervalId: undefined,
    overlays: new Map(),
    pendingNotify: new Set(),
    rows: new Map(),
    subscriptions: [],
    versions: new Map(),
  };
  state = engine;
  // Subscriptions and the mirror read happen in one synchronous block, so no
  // change can slip between them.
  engine.subscriptions.push(
    localDatabasesCollection.subscribeChanges((changes) => {
      handleDatabaseChanges(changes);
    }),
    localDatabaseRowsCollection.subscribeChanges((changes) => {
      handleRowChanges(changes);
    })
  );
  for (const database of localDatabasesCollection.toArray) {
    engine.databases.set(database.id, database);
  }
  for (const row of localDatabaseRowsCollection.toArray) {
    rowsMapOf(engine, row.databaseId).set(row.id, row);
  }
  rebuildEngineGraph(engine);
  for (const key of engine.graph.columns.keys()) {
    addFormulaDirtyRows(engine.dirty, key, FORMULA_ALL_ROWS);
  }
  runEvaluationPass(engine);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
}

function stopFormulaEngine(): void {
  const engine = state;
  if (engine === null) {
    return;
  }
  for (const subscription of engine.subscriptions) {
    subscription.unsubscribe();
  }
  if (engine.intervalId !== undefined) {
    window.clearInterval(engine.intervalId);
  }
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }
  state = null;
}

/** Tear the singleton down (tests); the next subscriber rebuilds it fresh. */
export function resetFormulaEngineForTests(): void {
  stopFormulaEngine();
  listeners.clear();
  subscriberCount = 0;
  evaluationObserver = null;
}

if (import.meta.hot) {
  // On HMR of this module, release subscriptions/timers; the replacing
  // module's first subscriber lazily rebuilds the engine (warm pass again).
  import.meta.hot.dispose(() => {
    stopFormulaEngine();
  });
}

// --- snapshots and subscription -------------------------------------------------------

/**
 * The current overlay for one database — a STABLE reference, replaced only
 * when that database's cache entries change (per-database version counter),
 * so `useSyncExternalStore` consumers re-render only for their database.
 * Databases with no cached formula cells share {@link EMPTY_FORMULA_OVERLAY}.
 */
export function formulaOverlaySnapshot(databaseId: string): FormulaOverlay {
  const engine = state;
  if (engine === null) {
    return EMPTY_FORMULA_OVERLAY;
  }
  const version = engine.versions.get(databaseId) ?? 0;
  const cached = engine.overlays.get(databaseId);
  if (cached !== undefined && cached.version === version) {
    return cached.overlay;
  }
  const databaseCache = engine.cache.get(databaseId);
  let overlay = EMPTY_FORMULA_OVERLAY;
  if (databaseCache !== undefined && databaseCache.size > 0) {
    overlay = new Map();
    for (const [rowId, rowCache] of databaseCache) {
      const entry: Record<string, FormulaCellResult> = {};
      for (const [fieldId, cell] of rowCache) {
        entry[fieldId] = cell.result;
      }
      overlay.set(rowId, entry);
    }
  }
  engine.overlays.set(databaseId, { overlay, version });
  return overlay;
}

/**
 * Subscribe to one database's overlay. The first subscriber starts the
 * engine (including the synchronous warm pass, so the caller's next
 * `formulaOverlaySnapshot` read sees computed values). No-op on the server.
 */
export function subscribeFormulaEngine(
  databaseId: string,
  listener: () => void
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  ensureFormulaEngineStarted();
  let set = listeners.get(databaseId);
  if (set === undefined) {
    set = new Set();
    listeners.set(databaseId, set);
  }
  set.add(listener);
  subscriberCount += 1;
  updateFormulaClock();
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      listeners.delete(databaseId);
    }
    subscriberCount -= 1;
    updateFormulaClock();
  };
}

const getEmptyOverlay = () => EMPTY_FORMULA_OVERLAY;

/**
 * One database's live formula overlay, engine-served: reacts to edits in
 * THIS database and — through the dependency graph — to edits in any
 * database its formulas traverse into (the reactive cross-database path the
 * pure overlay never had). SSR-safe: the server (and the pre-subscribe first
 * client render) sees the shared empty overlay.
 */
export function useFormulaOverlay(databaseId: string): FormulaOverlay {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeFormulaEngine(databaseId, onStoreChange),
    [databaseId]
  );
  const getSnapshot = useCallback(
    () => formulaOverlaySnapshot(databaseId),
    [databaseId]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getEmptyOverlay);
}
