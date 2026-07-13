// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JsonValue, LocalDatabase } from "@/lib/schemas/database.ts";

/**
 * Engine-level regression tests. Each test imports a FRESH engine module
 * (module state is global) and uses a database id unique to the test, so
 * listeners left on the shared jsdom `document` by earlier instances go
 * quiet (their `databaseGet` lookups miss and they drop their schedules).
 */

const mocks = vi.hoisted(() => ({
  applySyncSnapshot: vi.fn(),
  clearSyncMeta: vi.fn(),
  databaseGet: vi.fn(),
  fetchRows: vi.fn(),
  getConnector: vi.fn(),
  getConnectorToken: vi.fn(() => undefined),
  getSyncMeta: vi.fn(),
  setSyncMeta: vi.fn(),
  subscribeChanges: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabasesCollection: {
    get: mocks.databaseGet,
    subscribeChanges: mocks.subscribeChanges,
  },
}));

vi.mock("@/db/queries/database-sync-ops.ts", () => ({
  applySyncSnapshot: mocks.applySyncSnapshot,
  reconcileSyncedFields: vi.fn(() => 0),
}));

vi.mock("@/db/sync/sync-meta-store.ts", () => ({
  clearSyncMeta: mocks.clearSyncMeta,
  getSyncMeta: mocks.getSyncMeta,
  setSyncMeta: mocks.setSyncMeta,
}));

vi.mock("@/lib/connectors/registry.ts", () => ({
  getConnector: mocks.getConnector,
}));

vi.mock("@/lib/connectors/token-store.ts", () => ({
  getConnectorToken: mocks.getConnectorToken,
}));

type Engine = typeof import("@/db/sync/database-sync-engine.ts");

type ChangeCallback = (
  changes: {
    type: "insert" | "update" | "delete";
    key?: string;
    value?: LocalDatabase;
  }[]
) => void;

let visibility: DocumentVisibilityState = "visible";
let changeCallback: ChangeCallback | undefined;
let initialDatabases: LocalDatabase[] = [];

Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => visibility,
});

function setVisibility(next: DocumentVisibilityState): void {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

function makeDatabase(
  id: string,
  config: Record<string, JsonValue>
): LocalDatabase {
  return {
    id,
    name: "Synced",
    primaryFieldId: "f-title",
    source: { kind: "connector", connectorId: "github-prs", config },
    fields: [
      { id: "f-title", name: "Title", type: "text", sourceKey: "title" },
    ],
    views: [{ id: "view-1", name: "Table", type: "table", config: {} }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Seed one connector database as the engine's world. */
function seedDatabase(database: LocalDatabase): void {
  initialDatabases = [database];
  mocks.databaseGet.mockImplementation((id: string) =>
    id === database.id ? database : undefined
  );
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

/** Advance fake timers and settle the async sync pass they trigger. */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await flushMicrotasks();
}

async function importEngine(): Promise<Engine> {
  const engine = await import("@/db/sync/database-sync-engine.ts");
  await flushMicrotasks();
  return engine;
}

function appliedSnapshot(persisted: Promise<void>) {
  return { inserted: 1, updated: 0, removed: 0, missingCounts: {}, persisted };
}

/**
 * Minimal Web Locks fake: exclusive FIFO grants, abortable while queued,
 * released when the grant callback's promise settles.
 */
class FakeLockManager {
  private held = false;
  private readonly queue: {
    cb: () => unknown;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }[] = [];

  get isHeld(): boolean {
    return this.held;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  request(
    _name: string,
    options: { mode?: string; signal?: AbortSignal },
    cb: () => unknown
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const entry = { cb, resolve, reject };
      options.signal?.addEventListener("abort", () => {
        const index = this.queue.indexOf(entry);
        if (index >= 0) {
          this.queue.splice(index, 1);
          reject(new DOMException("aborted", "AbortError"));
        }
      });
      this.queue.push(entry);
      this.grantNext();
    });
  }

  private grantNext(): void {
    if (this.held) {
      return;
    }
    const entry = this.queue.shift();
    if (!entry) {
      return;
    }
    this.held = true;
    Promise.resolve()
      .then(() => entry.cb())
      .then(
        (value) => {
          this.held = false;
          entry.resolve(value);
          this.grantNext();
        },
        (error) => {
          this.held = false;
          entry.reject(error);
          this.grantNext();
        }
      );
  }
}

function installLocks(manager: FakeLockManager | undefined): void {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: manager,
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  visibility = "visible";
  initialDatabases = [];
  changeCallback = undefined;
  installLocks(undefined);
  mocks.clearSyncMeta.mockResolvedValue(undefined);
  mocks.getSyncMeta.mockResolvedValue(undefined);
  mocks.setSyncMeta.mockResolvedValue(undefined);
  mocks.getConnector.mockReturnValue({
    id: "github-prs",
    pollPolicy: { minMs: 60_000, defaultMs: 300_000 },
    fields: () => [],
    fetchRows: mocks.fetchRows,
  });
  mocks.subscribeChanges.mockImplementation(
    (cb: ChangeCallback, options?: { includeInitialState?: boolean }) => {
      changeCallback = cb;
      if (options?.includeInitialState) {
        cb(
          initialDatabases.map((database) => ({
            type: "insert" as const,
            value: database,
          }))
        );
      }
      return { unsubscribe: mocks.unsubscribe };
    }
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sync meta vs apply-commit ordering", () => {
  it("persists the new etag only after the row transaction commits", async () => {
    const database = makeDatabase("db-etag-ok", { owner: "o", repo: "r" });
    seedDatabase(database);
    mocks.getSyncMeta.mockResolvedValue({ etag: 'W/"old"' });
    mocks.fetchRows.mockResolvedValue({
      kind: "rows",
      rows: [{ externalId: "x", values: { title: "t" } }],
      etag: 'W/"new"',
    });
    mocks.applySyncSnapshot.mockReturnValue(appliedSnapshot(Promise.resolve()));

    await importEngine();
    await advance(0);

    expect(mocks.setSyncMeta).toHaveBeenCalledWith(
      database.id,
      expect.objectContaining({ etag: 'W/"new"' })
    );
  });

  it("keeps the old etag and records lastError when the apply commit fails", async () => {
    const database = makeDatabase("db-etag-fail", { owner: "o", repo: "r" });
    seedDatabase(database);
    mocks.getSyncMeta.mockResolvedValue({ etag: 'W/"old"' });
    mocks.fetchRows.mockResolvedValue({
      kind: "rows",
      rows: [{ externalId: "x", values: { title: "t" } }],
      etag: 'W/"new"',
    });
    const commitError = new Error("QuotaExceededError");
    const persisted = Promise.reject(commitError);
    persisted.catch(() => undefined);
    mocks.applySyncSnapshot.mockReturnValue(appliedSnapshot(persisted));

    const engine = await importEngine();
    await advance(0);

    // The rolled-back pass must never record the new validator — that would
    // freeze the rows behind 304 responses forever.
    for (const call of mocks.setSyncMeta.mock.calls) {
      expect(call[1]).not.toMatchObject({ etag: 'W/"new"' });
    }
    expect(mocks.setSyncMeta).toHaveBeenLastCalledWith(
      database.id,
      expect.objectContaining({
        etag: 'W/"old"',
        lastError: expect.objectContaining({
          message: "QuotaExceededError",
        }),
      })
    );
    expect(engine.getSyncStatus(database.id).error?.message).toBe(
      "QuotaExceededError"
    );
    // Transient failure: a retry is scheduled.
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });
});

describe("non-transient (config/auth) failures stop polling", () => {
  it("halts scheduling on a config error and resumes when the source changes", async () => {
    const database = makeDatabase("db-halt-config", { owner: "o", repo: "r" });
    seedDatabase(database);
    mocks.fetchRows.mockRejectedValue(
      Object.assign(new Error("Repository not found"), { kind: "config" })
    );

    const engine = await importEngine();
    await advance(0);

    expect(mocks.fetchRows).toHaveBeenCalledTimes(1);
    expect(engine.getSyncStatus(database.id).error?.kind).toBe("config");
    // No retry timer: config errors are deterministic.
    expect(vi.getTimerCount()).toBe(0);
    await advance(60 * 60 * 1000);
    expect(mocks.fetchRows).toHaveBeenCalledTimes(1);

    // A non-source edit (rename) must NOT restart the failing loop.
    changeCallback?.([
      { type: "update", value: { ...database, name: "Renamed" } },
    ]);
    expect(vi.getTimerCount()).toBe(0);

    // Editing the source (updateDatabaseSource lands here via the
    // collection subscription) resumes polling.
    const edited = makeDatabase(database.id, { owner: "o", repo: "fixed" });
    seedDatabase(edited);
    mocks.fetchRows.mockResolvedValue({ kind: "notModified" });
    changeCallback?.([{ type: "update", value: edited }]);
    expect(vi.getTimerCount()).toBe(1);
    await advance(0);
    expect(mocks.fetchRows).toHaveBeenCalledTimes(2);
    expect(engine.getSyncStatus(database.id).error).toBeUndefined();
    // Success re-arms the normal schedule.
    expect(vi.getTimerCount()).toBe(1);
  });

  it("halts on an auth error and resumes via requestImmediateSync", async () => {
    const database = makeDatabase("db-halt-auth", { owner: "o", repo: "r" });
    seedDatabase(database);
    mocks.fetchRows.mockRejectedValue(
      Object.assign(new Error("GitHub token was rejected"), { kind: "auth" })
    );

    const engine = await importEngine();
    await advance(0);

    expect(engine.getSyncStatus(database.id).error?.kind).toBe("auth");
    expect(vi.getTimerCount()).toBe(0);

    // Manual pass (create panel after token entry / "Refresh now") retries
    // and a success re-arms scheduling.
    mocks.fetchRows.mockResolvedValue({ kind: "notModified" });
    expect(engine.requestImmediateSync(database.id)).toBe(true);
    await flushMicrotasks();
    expect(mocks.fetchRows).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("keeps retrying transient (network) failures on a timer", async () => {
    const database = makeDatabase("db-net-retry", { owner: "o", repo: "r" });
    seedDatabase(database);
    mocks.fetchRows.mockRejectedValue(
      Object.assign(new Error("offline"), { kind: "network" })
    );

    await importEngine();
    await advance(0);

    expect(mocks.fetchRows).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    // interval 300s, first failure → backoff 600s.
    await advance(600_000);
    expect(mocks.fetchRows).toHaveBeenCalledTimes(2);
  });
});

describe("visibility-aware leadership", () => {
  it("resigns the lock after the hidden grace so a waiting tab takes over, and re-acquires when visible", async () => {
    const locks = new FakeLockManager();
    installLocks(locks);
    const database = makeDatabase("db-leadership", { owner: "o", repo: "r" });
    seedDatabase(database);
    mocks.fetchRows.mockResolvedValue({ kind: "notModified" });

    const engine = await importEngine();
    await advance(0);

    // Visible at boot: this tab requested and won the lock.
    expect(locks.isHeld).toBe(true);
    expect(engine.requestImmediateSync(database.id)).toBe(true);
    await flushMicrotasks();
    const statusBefore = engine.getSyncStatus(database.id);
    expect(statusBefore.lastSyncedAt).toBeDefined();

    // Another (visible) tab queues for the lock.
    let otherTabLeads = false;
    locks
      .request("site-db-sync-leader", {}, () => {
        otherTabLeads = true;
        return new Promise<void>(() => undefined);
      })
      .catch(() => undefined);
    await flushMicrotasks();
    expect(otherTabLeads).toBe(false);

    // Hidden for less than the grace: still the leader.
    setVisibility("hidden");
    await advance(engine.HIDDEN_LEADER_RESIGN_MS - 1000);
    setVisibility("visible");
    await flushMicrotasks();
    expect(engine.requestImmediateSync(database.id)).toBe(true);
    await flushMicrotasks();
    expect(otherTabLeads).toBe(false);

    // Hidden past the grace: the lock is released and the waiting tab leads.
    const statusBeforeResign = engine.getSyncStatus(database.id);
    setVisibility("hidden");
    await advance(engine.HIDDEN_LEADER_RESIGN_MS);
    expect(otherTabLeads).toBe(true);
    expect(engine.requestImmediateSync(database.id)).toBe(false);
    // Statuses survive the resignation (last known state stays visible).
    expect(engine.getSyncStatus(database.id).lastSyncedAt).toBe(
      statusBeforeResign.lastSyncedAt
    );
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("only requests the lock while visible (hidden boot waits for first show)", async () => {
    const locks = new FakeLockManager();
    installLocks(locks);
    const database = makeDatabase("db-hidden-boot", { owner: "o", repo: "r" });
    seedDatabase(database);
    mocks.fetchRows.mockResolvedValue({ kind: "notModified" });

    visibility = "hidden";
    const engine = await importEngine();
    await advance(0);

    // Hidden at boot: no request issued, no leadership.
    expect(locks.isHeld).toBe(false);
    expect(locks.pendingCount).toBe(0);
    expect(engine.requestImmediateSync(database.id)).toBe(false);

    // First show: this tab requests, wins, and starts polling.
    setVisibility("visible");
    await advance(0);
    expect(locks.isHeld).toBe(true);
    expect(engine.requestImmediateSync(database.id)).toBe(true);
  });

  it("withdraws a queued request when the tab hides while waiting", async () => {
    const locks = new FakeLockManager();
    installLocks(locks);

    // Another tab already holds the lock.
    let releaseOther: (() => void) | undefined;
    locks
      .request(
        "site-db-sync-leader",
        {},
        () =>
          new Promise<void>((resolve) => {
            releaseOther = resolve;
          })
      )
      .catch(() => undefined);
    await flushMicrotasks();
    expect(locks.isHeld).toBe(true);

    const database = makeDatabase("db-withdraw", { owner: "o", repo: "r" });
    seedDatabase(database);
    mocks.fetchRows.mockResolvedValue({ kind: "notModified" });

    const engine = await importEngine();
    await advance(0);
    expect(locks.pendingCount).toBe(1);

    // Hiding while queued withdraws the request — a hidden tab must never
    // win leadership over a visible one.
    setVisibility("hidden");
    await flushMicrotasks();
    expect(locks.pendingCount).toBe(0);

    releaseOther?.();
    await flushMicrotasks();
    expect(locks.isHeld).toBe(false);
    expect(engine.requestImmediateSync(database.id)).toBe(false);

    // Once visible again the tab re-requests and takes the free lock.
    setVisibility("visible");
    await advance(0);
    expect(locks.isHeld).toBe(true);
    expect(engine.requestImmediateSync(database.id)).toBe(true);
  });
});

describe("live streams follow source config edits", () => {
  it("reopens the socket against the new symbol set when the config changes", async () => {
    const locks = new FakeLockManager();
    installLocks(locks);

    const streamUnsubs: ReturnType<typeof vi.fn>[] = [];
    const subscribe = vi.fn(
      (_ctx: { config: Record<string, unknown> }, _handlers: unknown) => {
        const unsub = vi.fn();
        streamUnsubs.push(unsub);
        return unsub;
      }
    );
    mocks.getConnector.mockReturnValue({
      id: "live",
      pollPolicy: { minMs: 60_000, defaultMs: 300_000 },
      fields: () => [],
      fetchRows: mocks.fetchRows,
      stream: { subscribe },
    });
    mocks.fetchRows.mockResolvedValue({ kind: "notModified" });

    const v1 = makeDatabase("db-stream", { symbols: ["BTCUSDT"] });
    seedDatabase(v1);

    const engine = await importEngine();
    await advance(0);

    // A view watching the database opens the live socket (after the token
    // microtask resolves) against the seeded symbol set.
    const unwatch = engine.watchDatabaseSync(v1.id);
    await flushMicrotasks();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0][0].config).toEqual({ symbols: ["BTCUSDT"] });

    // Editing the symbol list lands as a collection update. The engine drops
    // the socket bound to the old set and reopens against the new one.
    const v2 = makeDatabase("db-stream", { symbols: ["BTCUSDT", "ETHUSDT"] });
    mocks.databaseGet.mockImplementation((id: string) =>
      id === v2.id ? v2 : undefined
    );
    changeCallback?.([{ type: "update", value: v2 }]);
    await flushMicrotasks();

    expect(streamUnsubs[0]).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe.mock.calls[1][0].config).toEqual({
      symbols: ["BTCUSDT", "ETHUSDT"],
    });

    unwatch();
    await flushMicrotasks();
  });

  it("leaves the socket alone when a non-config edit lands", async () => {
    const locks = new FakeLockManager();
    installLocks(locks);

    const subscribe = vi.fn(() => vi.fn());
    mocks.getConnector.mockReturnValue({
      id: "live",
      pollPolicy: { minMs: 60_000, defaultMs: 300_000 },
      fields: () => [],
      fetchRows: mocks.fetchRows,
      stream: { subscribe },
    });
    mocks.fetchRows.mockResolvedValue({ kind: "notModified" });

    const v1 = makeDatabase("db-stream-rename", { symbols: ["BTCUSDT"] });
    seedDatabase(v1);

    const engine = await importEngine();
    await advance(0);
    const unwatch = engine.watchDatabaseSync(v1.id);
    await flushMicrotasks();
    expect(subscribe).toHaveBeenCalledTimes(1);

    // Same config, only the name changed — the socket must not churn.
    const renamed = { ...v1, name: "Renamed" };
    mocks.databaseGet.mockImplementation((id: string) =>
      id === renamed.id ? renamed : undefined
    );
    changeCallback?.([{ type: "update", value: renamed }]);
    await flushMicrotasks();

    expect(subscribe).toHaveBeenCalledTimes(1);

    unwatch();
    await flushMicrotasks();
  });
});
