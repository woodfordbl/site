import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import {
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
} from "@/db/sync/sync-schedule.ts";
import { getConnector } from "@/lib/connectors/registry.ts";
import { getConnectorToken } from "@/lib/connectors/token-store.ts";
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
 */

const LEADER_LOCK_NAME = "site-db-sync-leader";
const FETCH_TIMEOUT_MS = 15_000;

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
  intervalMs: number;
  lastAttemptAt?: number;
  /** Epoch ms the pending timer aims at; drives overdue checks on refocus. */
  nextRunAt?: number;
  /** Timer fired while the document was hidden; run on next `visible`. */
  pendingWhileHidden: boolean;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

const entries = new Map<string, ScheduleEntry>();
const statusByDatabase = new Map<string, DatabaseSyncStatus>();
const statusSubscribers = new Map<
  string,
  Set<(status: DatabaseSyncStatus) => void>
>();

let isLeader = false;
let engineStarted = false;

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
  entry.lastAttemptAt = Date.now();
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
        meta?.missingCounts ?? {}
      );
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
    scheduleNext(databaseId, entry.intervalMs);
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
    scheduleNext(
      databaseId,
      computeRetryDelay({
        consecutiveFailures: entry.consecutiveFailures,
        intervalMs: entry.intervalMs,
        retryAfterMs,
      })
    );
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
  const existing = entries.get(database.id);
  if (existing) {
    // Config/interval edits take effect on the next pass; an in-flight or
    // already-scheduled run is not interrupted.
    existing.intervalMs = intervalMs;
    return;
  }

  entries.set(database.id, {
    consecutiveFailures: 0,
    intervalMs,
    pendingWhileHidden: false,
    running: false,
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
  if (document.visibilityState !== "visible") {
    return;
  }
  const now = Date.now();
  for (const [databaseId, entry] of entries) {
    const overdue =
      entry.pendingWhileHidden ||
      (entry.nextRunAt !== undefined && entry.nextRunAt <= now) ||
      isSyncOverdue(entry.lastAttemptAt, entry.intervalMs, now);
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
  // `includeInitialState` folds the boot scan into the same code path.
  localDatabasesCollection.subscribeChanges(
    (changes) => {
      for (const change of changes) {
        if (change.type === "delete") {
          dropSchedule(String(change.key));
          clearSyncMeta(String(change.key)).catch(() => undefined);
          continue;
        }
        ensureSchedule(change.value);
      }
    },
    { includeInitialState: true }
  );
}

/**
 * Boot the connector sync engine (idempotent, browser-only). Elects a single
 * polling leader across tabs via the Web Locks API; the lock is held for the
 * tab's lifetime, and when a follower inherits it (prior leader closed) it
 * starts scheduling at that moment. Environments without `navigator.locks`
 * skip election and just run.
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

  locks
    .request(LEADER_LOCK_NAME, { mode: "exclusive" }, () => {
      becomeLeader();
      // Never resolve: the leader holds the lock until the tab dies, at
      // which point the browser grants it to the next waiting tab.
      return new Promise<void>(() => undefined);
    })
    .catch(() => {
      // Lock request failed outright (not merely queued) — degrade to
      // leaderless polling rather than never syncing.
      becomeLeader();
    });
}

// Boot on import, mirroring `local-collections.ts` — the provider pulls this
// module in with a side-effect import; the window guard makes SSR a no-op.
startDatabaseSync();
