import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import {
  applyStreamTick,
  applySyncSnapshot,
  reconcileSyncedFields,
} from "@/db/queries/database-sync-ops.ts";
import {
  clearSyncMeta,
  type DatabaseSyncMeta,
  getSyncMeta,
  type SyncErrorKind,
  type SyncMetaError,
  setSyncMeta,
} from "@/db/sync/sync-meta-store.ts";
import {
  computeRetryDelay,
  isSyncOverdue,
  resolveSyncInterval,
  resolveWatchedInterval,
} from "@/db/sync/sync-schedule.ts";
import { getConnector } from "@/lib/connectors/registry.ts";
import { getConnectorToken } from "@/lib/connectors/token-store.ts";
import type {
  ConnectorDefinition,
  ConnectorRow,
} from "@/lib/connectors/types.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

/**
 * Client-side sync scheduler for connector databases — the "backend" of
 * docs/proposals/notion-style-databases.md §4.3, framework-free by design.
 *
 * Division of labor (deliberate deviation from the proposal's
 * queryCollectionOptions sketch): fetched snapshots are diffed straight into
 * `localDatabaseRowsCollection` by `applySyncSnapshot`, so synced rows ride
 * the existing localStorage shards and their cross-tab `storage`-event
 * propagation. Exactly one tab (the Web Locks leader) polls; follower tabs
 * run no timers and receive rows through storage events.
 *
 * Leadership is visibility-aware: tabs only REQUEST the leader lock while
 * visible, and a leader that stays hidden past a short grace resigns (releases
 * the lock) so a visible tab wins it and keeps polling — a backgrounded
 * leader can never starve the tab the user is actually looking at. With every
 * tab hidden nobody holds the lock; whichever tab is shown first acquires it.
 */

const LEADER_LOCK_NAME = "site-db-sync-leader";
const FETCH_TIMEOUT_MS = 15_000;
/** Grace a hidden leader gets before resigning, so quick tab flips don't
 * thrash leadership. */
export const HIDDEN_LEADER_RESIGN_MS = 5000;

export interface DatabaseSyncStatus {
  /** Last failure; cleared by the next success. */
  error?: SyncMetaError;
  /** ISO timestamp of the last successful sync in this session. */
  lastSyncedAt?: string;
  /** True while a fetch/apply pass for this database is in flight. */
  syncing: boolean;
}

const IDLE_STATUS: DatabaseSyncStatus = { syncing: false };

interface ScheduleEntry {
  consecutiveFailures: number;
  /**
   * Polling stopped after a non-transient failure (`config`/`auth`): the
   * status keeps showing the error, but no retry is scheduled. Resumes when
   * the database's source changes (see {@link ensureSchedule}) or a manual
   * pass is requested ({@link requestImmediateSync}).
   */
  halted: boolean;
  intervalMs: number;
  lastAttemptAt?: number;
  /** Fingerprint of the connector's `list` config values (the symbol set). */
  listFingerprint: string;
  /** Connector floor (`pollPolicy.minMs`) — the watched cadence. */
  minIntervalMs: number;
  /** Epoch ms the pending timer aims at; drives overdue checks on refocus. */
  nextRunAt?: number;
  /** Timer fired while the document was hidden; run on next `visible`. */
  pendingWhileHidden: boolean;
  /**
   * Set when the symbol set changed (a `list` config edit): the next snapshot
   * deletes rows for dropped symbols immediately, skipping the tombstone grace.
   * Other source edits (currency, refreshMs) never set it, so a partial
   * provider response can't delete live rows. Cleared once a pass consumes it.
   */
  pruneOnNextSnapshot: boolean;
  running: boolean;
  /** JSON fingerprint of `database.source`; a change resumes a halted entry. */
  sourceFingerprint: string;
  timer?: ReturnType<typeof setTimeout>;
}

const entries = new Map<string, ScheduleEntry>();
/** Ref-counted watchers per database (see {@link watchDatabaseSync}). */
const watcherCounts = new Map<string, number>();
const statusByDatabase = new Map<string, DatabaseSyncStatus>();
const statusSubscribers = new Map<
  string,
  Set<(status: DatabaseSyncStatus) => void>
>();

let isLeader = false;
let engineStarted = false;
/** Resolves the held Web Lock promise — defined only while holding the lock. */
let releaseLeaderLock: (() => void) | undefined;
/** Aborts a queued (not yet granted) lock request when the tab goes hidden. */
let lockRequestAbort: AbortController | undefined;
/** Pending hidden-leader resignation (see {@link HIDDEN_LEADER_RESIGN_MS}). */
let hiddenResignTimer: ReturnType<typeof setTimeout> | undefined;
/** Tears down the leader's databases subscription on resignation. */
let unsubscribeDatabases: (() => void) | undefined;

/**
 * Subscribe to a database's sync status (syncing / lastSyncedAt / error)
 * without polling IndexedDB — the engine pushes an update on every state
 * change, and the callback fires immediately with the current status.
 * Works in every tab; follower tabs simply stay at the idle status until
 * leader-applied rows arrive via storage events.
 */
export function subscribeSyncStatus(
  databaseId: string,
  callback: (status: DatabaseSyncStatus) => void
): () => void {
  let subscribers = statusSubscribers.get(databaseId);
  if (!subscribers) {
    subscribers = new Set();
    statusSubscribers.set(databaseId, subscribers);
  }
  subscribers.add(callback);
  callback(statusByDatabase.get(databaseId) ?? IDLE_STATUS);

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) {
      statusSubscribers.delete(databaseId);
    }
  };
}

export function getSyncStatus(databaseId: string): DatabaseSyncStatus {
  return statusByDatabase.get(databaseId) ?? IDLE_STATUS;
}

function setStatus(databaseId: string, status: DatabaseSyncStatus): void {
  statusByDatabase.set(databaseId, status);
  const subscribers = statusSubscribers.get(databaseId);
  if (!subscribers) {
    return;
  }
  for (const callback of subscribers) {
    callback(status);
  }
}

/**
 * Run one sync pass for a database right now ("Refresh now").
 *
 * Leader-only by design: in a follower tab this is a best-effort no-op that
 * returns `false` — the chosen v1 approach (documented alternative was a
 * scheduler-less one-shot fetch+apply in the follower; rejected to keep all
 * writes and rate-limit accounting in one tab). The refreshed rows still
 * reach follower tabs through localStorage storage events once the leader's
 * next scheduled pass lands. Returns `true` when a pass was started or was
 * already in flight.
 *
 * This is also the manual RESUME path for a database halted by a
 * non-transient (`config`/`auth`) failure: the pass runs regardless of the
 * halt, and a success re-arms normal scheduling (the create panel fires this
 * after token entry; "Refresh now" covers a re-saved token).
 */
export function requestImmediateSync(databaseId: string): boolean {
  const entry = entries.get(databaseId);
  if (!(isLeader && entry)) {
    return false;
  }
  if (!entry.running) {
    runSync(databaseId).catch(() => undefined);
  }
  return true;
}

function isDocumentVisible(): boolean {
  return (
    typeof document === "undefined" || document.visibilityState === "visible"
  );
}

/** Effective cadence for a database: the connector floor while watched in a
 * visible tab, the resolved interval otherwise. */
function effectiveIntervalMs(databaseId: string, entry: ScheduleEntry): number {
  return resolveWatchedInterval({
    intervalMs: entry.intervalMs,
    minMs: entry.minIntervalMs,
    watched: (watcherCounts.get(databaseId) ?? 0) > 0 && isDocumentVisible(),
  });
}

/**
 * Watch a synced database while its view is on screen: while it has ≥1
 * watcher AND the tab is visible AND this tab is the polling leader, the
 * database polls at the connector's floor (`pollPolicy.minMs`) instead of
 * its configured cadence; on watch start an immediate pass runs when the
 * last attempt is older than the watched interval. Returns an idempotent
 * unsubscribe that restores the normal cadence at zero watchers.
 *
 * Follower-tab limitation (v1, deliberate): watching in a follower tab only
 * registers locally — rows still arrive via the leader's storage events at
 * the leader's cadence. A cross-tab "nudge the leader" ping (localStorage)
 * is the sketched upgrade. If a watching follower later inherits leadership,
 * its registered watchers take effect immediately.
 *
 * Failure backoff wins over watch acceleration: a database in backoff
 * (`consecutiveFailures > 0`) is never sped up by watch start/stop, so a
 * rate-limited connector cannot be hammered by mounting views.
 */
export function watchDatabaseSync(databaseId: string): () => void {
  const next = (watcherCounts.get(databaseId) ?? 0) + 1;
  watcherCounts.set(databaseId, next);
  if (next === 1) {
    applyWatchedCadence(databaseId);
    // A newly-watched streaming database opens its socket here.
    reconcileStreams();
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const count = watcherCounts.get(databaseId) ?? 0;
    if (count <= 1) {
      watcherCounts.delete(databaseId);
      restoreConfiguredCadence(databaseId);
      // Last watcher gone — close the socket.
      reconcileStreams();
    } else {
      watcherCounts.set(databaseId, count - 1);
    }
  };
}

/** First watcher arrived: sync now if stale at the watched cadence, else pull
 * the pending timer forward to it (never pushing a sooner run later). */
function applyWatchedCadence(databaseId: string): void {
  const entry = entries.get(databaseId);
  if (
    !(isLeader && entry) ||
    entry.running ||
    entry.consecutiveFailures > 0 ||
    !isDocumentVisible()
  ) {
    return;
  }

  const watchedMs = effectiveIntervalMs(databaseId, entry);
  const now = Date.now();
  if (isSyncOverdue(entry.lastAttemptAt, watchedMs, now)) {
    runSync(databaseId).catch(() => undefined);
    return;
  }

  const dueAt = (entry.lastAttemptAt ?? now) + watchedMs;
  if (entry.nextRunAt === undefined || dueAt < entry.nextRunAt) {
    scheduleRun(databaseId, Math.max(0, dueAt - now));
  }
}

/** Last watcher left: re-aim the pending timer at the configured cadence. */
function restoreConfiguredCadence(databaseId: string): void {
  const entry = entries.get(databaseId);
  if (!(isLeader && entry) || entry.running || entry.consecutiveFailures > 0) {
    return;
  }

  const now = Date.now();
  const dueAt = (entry.lastAttemptAt ?? now) + entry.intervalMs;
  scheduleRun(databaseId, Math.max(0, dueAt - now));
}

// ---------------------------------------------------------------------------
// Live streaming (S1). A connector with a `stream` capability gets a WebSocket
// subscription — held ONLY by the visible leader tab, and only while a view is
// watching the database. Ticks are coalesced to bound collection writes, then
// applied via `applyStreamTick`; the localStorage-sharded row collection
// propagates them to follower tabs through storage events (same path snapshots
// use), so no separate cross-tab channel is needed. A dropped socket surfaces
// via `onError` and reconnects with backoff. Polling continues underneath as
// the seed + unwatched-refresh path; streaming just layers live updates on top.
// ---------------------------------------------------------------------------

/** Coalesce window: ticks within this window collapse to one collection write
 * per row (last-value-wins), capping writes at ~4/sec even on a fast feed. */
const STREAM_FLUSH_MS = 250;
/** Base unit for stream reconnect backoff (grows via `computeRetryDelay`). */
const STREAM_RECONNECT_BASE_MS = 1000;

interface StreamHandle {
  flushTimer?: ReturnType<typeof setTimeout>;
  /** Latest value per `externalId` awaiting the next flush. */
  pending: Map<string, ConnectorRow>;
  /**
   * Fingerprint of the source config this socket was opened against (the
   * symbol list). When it drifts from the live database's config the symbol
   * set was edited, so `reconcileStreams` tears the socket down and reopens it
   * against the new set — the provider bound the old symbols at connect time.
   */
  signature: string;
  /** Tears down the provider subscription (set once `subscribe` returns). */
  unsubscribe: () => void;
}

/**
 * Fingerprint of the config that binds a connector's live socket — just the
 * connector config record (the symbol list). `refreshMs` lives as a sibling of
 * `config`, so poll-interval edits deliberately don't churn this and never
 * reopen the socket.
 */
function streamConfigSignature(database: LocalDatabase): string {
  return database.source?.kind === "connector"
    ? JSON.stringify(database.source.config ?? {})
    : "";
}

/**
 * Fingerprint of just the connector's `list` config values (the symbol set) —
 * the only edits that change which rows a snapshot should contain. Used to gate
 * immediate pruning: editing symbols prunes dropped rows now, but editing a
 * non-row config (display currency) or `refreshMs` must keep the tombstone
 * grace so a partial provider response never deletes live rows.
 */
function configListFingerprint(
  database: LocalDatabase,
  connector: ConnectorDefinition
): string {
  if (database.source?.kind !== "connector") {
    return "";
  }
  const config = database.source.config ?? {};
  const listValues: Record<string, unknown> = {};
  for (const field of connector.configFields ?? []) {
    if (field.kind === "list") {
      listValues[field.key] = config[field.key];
    }
  }
  return JSON.stringify(listValues);
}

const streams = new Map<string, StreamHandle>();
const streamReconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const streamFailures = new Map<string, number>();

/** A database should stream iff this tab is the visible leader and a view is
 * watching it — the same predicate that gates watch-mode acceleration. */
function shouldStream(databaseId: string): boolean {
  return (
    isLeader && isDocumentVisible() && (watcherCounts.get(databaseId) ?? 0) > 0
  );
}

/** Buffer a tick batch; schedule a flush if none is pending. */
function enqueueTick(databaseId: string, rows: ConnectorRow[]): void {
  const handle = streams.get(databaseId);
  if (!handle) {
    return;
  }
  // A tick means the socket is healthy — clear any reconnect backoff.
  streamFailures.delete(databaseId);
  for (const row of rows) {
    handle.pending.set(row.externalId, row);
  }
  if (handle.flushTimer === undefined) {
    handle.flushTimer = setTimeout(
      () => flushStream(databaseId),
      STREAM_FLUSH_MS
    );
  }
}

/** Apply the buffered ticks in one transaction and refresh liveness status. */
function flushStream(databaseId: string): void {
  const handle = streams.get(databaseId);
  if (!handle) {
    return;
  }
  handle.flushTimer = undefined;
  if (handle.pending.size === 0) {
    return;
  }
  const rows = [...handle.pending.values()];
  handle.pending.clear();

  const database = localDatabasesCollection.get(databaseId);
  if (!(database && isConnectorDatabase(database))) {
    return;
  }
  applyStreamTick(database, rows);
  const previous = getSyncStatus(databaseId);
  setStatus(databaseId, {
    ...previous,
    error: undefined,
    lastSyncedAt: new Date().toISOString(),
    syncing: false,
  });
}

/** Open a stream for a database (idempotent). The handle is registered
 * synchronously so a concurrent reconcile can't double-subscribe; the actual
 * `subscribe` runs once the connector token (if any) resolves. */
function ensureStream(databaseId: string): void {
  if (streams.has(databaseId)) {
    return;
  }
  const database = localDatabasesCollection.get(databaseId);
  if (!(database && isConnectorDatabase(database))) {
    return;
  }
  const connector = resolveConnector(database.source.connectorId);
  const stream = connector?.stream;
  if (!stream) {
    return;
  }

  const handle: StreamHandle = {
    pending: new Map(),
    signature: streamConfigSignature(database),
    unsubscribe: () => undefined,
  };
  streams.set(databaseId, handle);

  Promise.resolve(getConnectorToken(database.source.connectorId))
    .catch(() => undefined)
    .then((token) => {
      // Watch/leadership/visibility may have changed while resolving the token.
      if (streams.get(databaseId) !== handle) {
        return;
      }
      try {
        handle.unsubscribe = stream.subscribe(
          {
            config: database.source.config,
            fetchFn: (input, init) => fetch(input, init),
            token: token ?? undefined,
          },
          {
            onError: (error) => handleStreamError(databaseId, error),
            onRows: (rows) => enqueueTick(databaseId, rows),
          }
        );
      } catch (error) {
        handleStreamError(databaseId, error);
      }
    });
}

/** Tear down a stream's subscription and flush timer (does not touch reconnect
 * scheduling — that's `reconcileStreams`' job). */
function teardownStream(databaseId: string): void {
  const handle = streams.get(databaseId);
  if (!handle) {
    return;
  }
  if (handle.flushTimer !== undefined) {
    clearTimeout(handle.flushTimer);
    handle.flushTimer = undefined;
  }
  // Flush any coalesce-buffered ticks before tearing down so the latest prices
  // aren't dropped on reconnect, symbol edit, tab hide, or socket error.
  flushStream(databaseId);
  streams.delete(databaseId);
  try {
    handle.unsubscribe();
  } catch {
    // A connector's unsubscribe should never throw; ignore if it does.
  }
}

/** A dropped/failed socket: surface the error, then reconnect with backoff if
 * we still should be streaming. */
function handleStreamError(databaseId: string, error: unknown): void {
  const { kind, message } = readConnectorError(error);
  setStatus(databaseId, {
    error: { at: new Date().toISOString(), kind, message },
    lastSyncedAt: getSyncStatus(databaseId).lastSyncedAt,
    syncing: false,
  });
  teardownStream(databaseId);
  if (!shouldStream(databaseId)) {
    return;
  }
  const failures = (streamFailures.get(databaseId) ?? 0) + 1;
  streamFailures.set(databaseId, failures);
  const delay = computeRetryDelay({
    consecutiveFailures: failures,
    intervalMs: STREAM_RECONNECT_BASE_MS,
  });
  const timer = setTimeout(() => {
    streamReconnectTimers.delete(databaseId);
    if (shouldStream(databaseId)) {
      ensureStream(databaseId);
    }
  }, delay);
  streamReconnectTimers.set(databaseId, timer);
}

/** Reconcile live streams against current leadership/visibility/watch state:
 * open streams that should run, tear down those that shouldn't, and cancel
 * reconnect timers that are no longer wanted. Called whenever any of those
 * inputs change. Idempotent. */
function reconcileStreams(): void {
  const canStream = isLeader && isDocumentVisible();
  for (const databaseId of [...streams.keys()]) {
    if (!canStream || (watcherCounts.get(databaseId) ?? 0) === 0) {
      teardownStream(databaseId);
      continue;
    }
    // Symbols edited: the socket is bound to the old set. Drop it here; the
    // open-loop below reopens against the current config.
    const handle = streams.get(databaseId);
    const database = localDatabasesCollection.get(databaseId);
    if (
      handle &&
      database &&
      handle.signature !== streamConfigSignature(database)
    ) {
      teardownStream(databaseId);
    }
  }
  for (const [databaseId, timer] of [...streamReconnectTimers]) {
    if (!(canStream && (watcherCounts.get(databaseId) ?? 0) > 0)) {
      clearTimeout(timer);
      streamReconnectTimers.delete(databaseId);
      streamFailures.delete(databaseId);
    }
  }
  if (!canStream) {
    return;
  }
  for (const [databaseId, count] of watcherCounts) {
    if (
      count > 0 &&
      !streams.has(databaseId) &&
      !streamReconnectTimers.has(databaseId)
    ) {
      ensureStream(databaseId);
    }
  }
}

/** Registry lookup hardened against unknown ids, whether the registry
 * signals them by returning undefined or by throwing. */
function resolveConnector(
  connectorId: string
): ReturnType<typeof getConnector> | undefined {
  try {
    return getConnector(connectorId) ?? undefined;
  } catch {
    return;
  }
}

function isConnectorDatabase(
  database: LocalDatabase
): database is LocalDatabase & {
  source: Extract<LocalDatabase["source"], { kind: "connector" }>;
} {
  return database.source?.kind === "connector";
}

/** Extract retry/classification info from an unknown error, duck-typed so we
 * do not depend on the `ConnectorError` class identity across bundles. */
function readConnectorError(error: unknown): {
  message: string;
  kind?: SyncErrorKind;
  retryAfterMs?: number;
} {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { kind: "network", message: "Request timed out" };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (typeof error !== "object" || error === null) {
    return { message };
  }
  const shaped = error as { kind?: unknown; retryAfterMs?: unknown };
  const kind =
    shaped.kind === "auth" ||
    shaped.kind === "config" ||
    shaped.kind === "network" ||
    shaped.kind === "rateLimit"
      ? shaped.kind
      : undefined;
  const retryAfterMs =
    typeof shaped.retryAfterMs === "number" && shaped.retryAfterMs > 0
      ? shaped.retryAfterMs
      : undefined;
  return { kind, message, retryAfterMs };
}

function scheduleRun(databaseId: string, delayMs: number): void {
  const entry = entries.get(databaseId);
  if (!entry) {
    return;
  }
  if (entry.timer !== undefined) {
    clearTimeout(entry.timer);
  }
  entry.nextRunAt = Date.now() + delayMs;
  entry.timer = setTimeout(() => {
    entry.timer = undefined;
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      // Paused while hidden; the visibilitychange listener re-runs overdue
      // databases the moment the tab is visible again.
      entry.pendingWhileHidden = true;
      return;
    }
    runSync(databaseId).catch(() => undefined);
  }, delayMs);
}

async function runSync(databaseId: string): Promise<void> {
  const entry = entries.get(databaseId);
  if (!entry || entry.running) {
    return;
  }

  const database = localDatabasesCollection.get(databaseId);
  if (!(database && isConnectorDatabase(database))) {
    dropSchedule(databaseId);
    return;
  }

  entry.running = true;
  // A manual pass on a halted entry gives it a fresh chance; a success below
  // re-arms scheduling, a repeat config/auth failure re-halts.
  entry.halted = false;
  entry.lastAttemptAt = Date.now();
  // Consume the one-shot prune request from the last source edit; this pass
  // deletes rows for symbols dropped from the config with no tombstone grace.
  const pruneMissing = entry.pruneOnNextSnapshot;
  entry.pruneOnNextSnapshot = false;
  const previous = getSyncStatus(databaseId);
  setStatus(databaseId, { ...previous, syncing: true });

  let meta: DatabaseSyncMeta | undefined;
  try {
    const connector = resolveConnector(database.source.connectorId);
    if (!connector) {
      throw Object.assign(
        new Error(`Unknown connector "${database.source.connectorId}"`),
        { kind: "config" as const }
      );
    }

    meta = await getSyncMeta(databaseId);
    const token =
      (await Promise.resolve(
        getConnectorToken(database.source.connectorId)
      ).catch(() => undefined)) ?? undefined;

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
    let result: Awaited<ReturnType<typeof connector.fetchRows>>;
    try {
      result = await connector.fetchRows({
        config: database.source.config,
        etag: meta?.etag,
        fetchFn: (input, init) =>
          fetch(input, { ...init, signal: abort.signal }),
        token,
      });
    } finally {
      clearTimeout(timeout);
    }

    const lastSyncedAt = new Date().toISOString();
    if (result.kind === "rows") {
      reconcileSyncedFields(database, connector.fields(database.source.config));
      // Re-read so the snapshot maps against any fields just reconciled in.
      const latest = localDatabasesCollection.get(databaseId) ?? database;
      const applied = applySyncSnapshot(
        latest,
        result.rows,
        meta?.missingCounts ?? {},
        { pruneMissing }
      );
      // Only record the new validator once the row transaction has actually
      // committed. If the commit fails (e.g. storage quota) the rows were
      // rolled back — persisting the new ETag anyway would freeze them
      // behind 304 responses forever. The rejection lands in the catch
      // below: lastError is written, the OLD etag/missingCounts are kept,
      // and the retry refetches unconditionally against the stale validator.
      await applied.persisted;
      await setSyncMeta(databaseId, {
        etag: result.etag,
        lastSyncedAt,
        missingCounts: applied.missingCounts,
      });
    } else {
      await setSyncMeta(databaseId, {
        ...meta,
        lastError: undefined,
        lastSyncedAt,
      });
    }

    entry.consecutiveFailures = 0;
    setStatus(databaseId, { lastSyncedAt, syncing: false });
    // Watched databases reschedule at the connector floor (watch mode).
    scheduleNext(databaseId, effectiveIntervalMs(databaseId, entry));
  } catch (error) {
    entry.consecutiveFailures += 1;
    const { kind, message, retryAfterMs } = readConnectorError(error);
    const lastError: SyncMetaError = {
      at: new Date().toISOString(),
      kind,
      message,
    };
    await setSyncMeta(databaseId, { ...meta, lastError });
    setStatus(databaseId, {
      error: lastError,
      lastSyncedAt: getSyncStatus(databaseId).lastSyncedAt,
      syncing: false,
    });
    if (kind === "config" || kind === "auth") {
      // Non-transient: a bad config or rejected token fails deterministically,
      // so retrying on a timer is pure waste (and keeps replaying a revoked
      // token). Stop scheduling; the status keeps showing the error. Polling
      // resumes when (a) the database's source/config changes —
      // `ensureSchedule` sees a new source fingerprint via the collection
      // subscription, which is where `updateDatabaseSource` saves land — or
      // (b) a manual pass runs via `requestImmediateSync` (create panel after
      // token entry; "Refresh now" after re-saving a token in settings).
      entry.halted = true;
      entry.nextRunAt = undefined;
      entry.pendingWhileHidden = false;
    } else {
      scheduleNext(
        databaseId,
        computeRetryDelay({
          consecutiveFailures: entry.consecutiveFailures,
          intervalMs: effectiveIntervalMs(databaseId, entry),
          retryAfterMs,
        })
      );
    }
  } finally {
    entry.running = false;
  }
}

/** Schedule the next pass unless the database was dropped mid-run. */
function scheduleNext(databaseId: string, delayMs: number): void {
  if (entries.has(databaseId)) {
    scheduleRun(databaseId, delayMs);
  }
}

function ensureSchedule(database: LocalDatabase): void {
  if (!isConnectorDatabase(database)) {
    dropSchedule(database.id);
    return;
  }

  const connector = resolveConnector(database.source.connectorId);
  if (!connector) {
    setStatus(database.id, {
      error: {
        at: new Date().toISOString(),
        kind: "config",
        message: `Unknown connector "${database.source.connectorId}"`,
      },
      syncing: false,
    });
    return;
  }

  const intervalMs = resolveSyncInterval(
    database.source.refreshMs,
    connector.pollPolicy
  );
  const sourceFingerprint = JSON.stringify(database.source);
  const listFingerprint = configListFingerprint(database, connector);
  const existing = entries.get(database.id);
  if (existing) {
    // Config/interval edits take effect on the next pass; an in-flight or
    // already-scheduled run is not interrupted.
    existing.intervalMs = intervalMs;
    existing.minIntervalMs = connector.pollPolicy.minMs;
    const sourceChanged = existing.sourceFingerprint !== sourceFingerprint;
    const listChanged = existing.listFingerprint !== listFingerprint;
    existing.sourceFingerprint = sourceFingerprint;
    existing.listFingerprint = listFingerprint;
    // A source edit refetches now (e.g. a currency change refetches in the new
    // quote currency), instead of waiting for the next scheduled pass. Other
    // database edits (rename, view tweaks) don't change the fingerprint, so
    // they don't restart polling — and a halted loop (non-transient config/auth
    // failure) resumes only on a genuine source change, never on an identical
    // retry. Only a symbol-set edit (`listChanged`) prunes immediately; other
    // edits keep the tombstone grace so a partial response can't delete rows.
    if (sourceChanged && !existing.running) {
      existing.pruneOnNextSnapshot = listChanged;
      if (existing.halted) {
        existing.halted = false;
        existing.consecutiveFailures = 0;
      }
      scheduleRun(database.id, 0);
    }
    return;
  }

  entries.set(database.id, {
    consecutiveFailures: 0,
    halted: false,
    intervalMs,
    listFingerprint,
    minIntervalMs: connector.pollPolicy.minMs,
    pendingWhileHidden: false,
    pruneOnNextSnapshot: false,
    running: false,
    sourceFingerprint,
  });
  // First pass runs immediately — conditional requests make cold runs cheap.
  scheduleRun(database.id, 0);
}

function dropSchedule(databaseId: string): void {
  const entry = entries.get(databaseId);
  if (!entry) {
    return;
  }
  if (entry.timer !== undefined) {
    clearTimeout(entry.timer);
  }
  entries.delete(databaseId);
  statusByDatabase.delete(databaseId);
}

function handleVisibilityChange(): void {
  // Streams follow visibility both ways: torn down when hidden, reopened when
  // shown (the overdue-poll logic below only applies while visible).
  reconcileStreams();
  if (document.visibilityState !== "visible") {
    return;
  }
  const now = Date.now();
  for (const [databaseId, entry] of entries) {
    if (entry.halted) {
      // Halted after a config/auth failure — refocus never resumes it (only
      // a source change or an explicit `requestImmediateSync` does).
      continue;
    }
    const overdue =
      entry.pendingWhileHidden ||
      (entry.nextRunAt !== undefined && entry.nextRunAt <= now) ||
      // Effective interval: a watched database refreshed on refocus counts
      // as overdue at the watched cadence, not just the configured one.
      isSyncOverdue(
        entry.lastAttemptAt,
        effectiveIntervalMs(databaseId, entry),
        now
      );
    if (overdue && !entry.running) {
      entry.pendingWhileHidden = false;
      if (entry.timer !== undefined) {
        clearTimeout(entry.timer);
        entry.timer = undefined;
      }
      runSync(databaseId).catch(() => undefined);
    }
  }
}

function becomeLeader(): void {
  if (isLeader) {
    return;
  }
  isLeader = true;

  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Watch for connector databases appearing, changing, or going away.
  // `includeInitialState` folds the boot scan into the same code path (and
  // replays the full scan when leadership is re-acquired after a resign).
  const subscription = localDatabasesCollection.subscribeChanges(
    (changes) => {
      for (const change of changes) {
        if (change.type === "delete") {
          dropSchedule(String(change.key));
          clearSyncMeta(String(change.key)).catch(() => undefined);
          continue;
        }
        ensureSchedule(change.value);
      }
      // A source edit (e.g. the symbol list changed) may need the live socket
      // reopened against the new config; reconcile detects the drift.
      reconcileStreams();
    },
    { includeInitialState: true }
  );
  unsubscribeDatabases = () => subscription.unsubscribe();

  // Newly the leader — open streams for any already-watched databases.
  reconcileStreams();
}

/**
 * Hand leadership back: tear down the leader's timers and subscriptions,
 * then resolve the held Web Lock promise so the browser grants the lock to
 * the next waiting (visible) tab. Sync statuses are deliberately left in
 * place — they describe the last known state in this tab and the new leader
 * pushes fresh statuses in its own; an in-flight pass finishes harmlessly
 * (its entry is detached, so it reschedules nothing).
 */
function resignLeadership(): void {
  if (!isLeader) {
    return;
  }
  isLeader = false;

  document.removeEventListener("visibilitychange", handleVisibilityChange);
  unsubscribeDatabases?.();
  unsubscribeDatabases = undefined;
  for (const entry of entries.values()) {
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer);
    }
  }
  entries.clear();
  // No longer leader — close every stream (canStream is now false).
  reconcileStreams();

  const release = releaseLeaderLock;
  releaseLeaderLock = undefined;
  release?.();
}

/**
 * Request the leader lock (only ever called while this tab is visible). The
 * grant callback holds the lock until {@link resignLeadership} resolves it;
 * a queued request is withdrawn via its AbortController when the tab goes
 * hidden, so only visible tabs compete for leadership.
 */
function requestLeaderLock(locks: LockManager): void {
  if (
    isLeader ||
    lockRequestAbort !== undefined ||
    releaseLeaderLock !== undefined
  ) {
    return;
  }
  const controller = new AbortController();
  lockRequestAbort = controller;
  locks
    .request(
      LEADER_LOCK_NAME,
      { mode: "exclusive", signal: controller.signal },
      () => {
        if (lockRequestAbort === controller) {
          lockRequestAbort = undefined;
        }
        becomeLeader();
        // Held until this tab dies (browser releases it) or the hidden-grace
        // resign resolves it deliberately.
        return new Promise<void>((resolve) => {
          releaseLeaderLock = resolve;
        });
      }
    )
    .catch(() => {
      if (lockRequestAbort === controller) {
        lockRequestAbort = undefined;
      }
      if (controller.signal.aborted) {
        // Deliberate withdrawal: the tab went hidden while queued. The next
        // `visible` transition re-requests.
        return;
      }
      // Lock request failed outright (not merely queued) — degrade to
      // leaderless polling rather than never syncing. No lock is held in
      // this mode, so the hidden-grace resign never fires.
      becomeLeader();
    });
}

/**
 * Visibility-aware leadership (separate from the leader's own
 * `handleVisibilityChange`, which resumes overdue polls): visible tabs
 * request the lock, hidden tabs withdraw a queued request immediately and
 * resign a HELD lock after {@link HIDDEN_LEADER_RESIGN_MS} — so a visible
 * follower takes over polling instead of going stale behind a hidden leader.
 */
function handleLeadershipVisibility(locks: LockManager): void {
  if (document.visibilityState === "visible") {
    if (hiddenResignTimer !== undefined) {
      clearTimeout(hiddenResignTimer);
      hiddenResignTimer = undefined;
    }
    requestLeaderLock(locks);
    return;
  }

  if (!isLeader && lockRequestAbort !== undefined) {
    const controller = lockRequestAbort;
    lockRequestAbort = undefined;
    controller.abort();
    return;
  }
  if (releaseLeaderLock !== undefined && hiddenResignTimer === undefined) {
    hiddenResignTimer = setTimeout(() => {
      hiddenResignTimer = undefined;
      if (document.visibilityState !== "visible") {
        resignLeadership();
      }
    }, HIDDEN_LEADER_RESIGN_MS);
  }
}

/**
 * Boot the connector sync engine (idempotent, browser-only). Elects a single
 * polling leader across tabs via the Web Locks API with visibility-aware
 * hand-off: only visible tabs request the lock, and a leader hidden past a
 * short grace resigns it so a visible tab can take over (see the module
 * comment). Environments without `navigator.locks` skip election and just
 * run.
 */
export function startDatabaseSync(): void {
  if (typeof window === "undefined" || engineStarted) {
    return;
  }
  // HMR guard (same tradeoff as `startLocalCollectionsSync`): the original
  // module instance keeps running across hot updates instead of double-booting
  // timers and a second lock request.
  if (import.meta.hot) {
    const hot = import.meta.hot as { data?: Record<string, unknown> };
    hot.data ??= {};
    if (hot.data.databaseSyncStarted) {
      return;
    }
    hot.data.databaseSyncStarted = true;
  }
  engineStarted = true;

  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks?.request) {
    becomeLeader();
    return;
  }

  document.addEventListener("visibilitychange", () => {
    handleLeadershipVisibility(locks);
  });
  if (isDocumentVisible()) {
    requestLeaderLock(locks);
  }
  // Hidden at boot: no request yet — the listener above issues it the moment
  // this tab is first shown, keeping hidden tabs out of the election.
}

// Boot on import, mirroring `local-collections.ts` — the provider pulls this
// module in with a side-effect import; the window guard makes SSR a no-op.
startDatabaseSync();
