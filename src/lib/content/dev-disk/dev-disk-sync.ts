import {
  localBlocksCollection,
  localDatabaseRowsCollection,
  localDatabasesCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { deletePage } from "@/lib/content/delete-page.ts";
import { isDevDiskMode } from "@/lib/content/dev-disk/dev-disk-mode.ts";
import { recordOwnWrite } from "@/lib/content/dev-disk/own-writes.ts";
import {
  flushLocalDatabaseToSource,
  flushLocalPageToSource,
} from "@/lib/content/save-all-pages.ts";
import { isTemplatePageId } from "@/lib/pages/template-page.ts";
import { isLocallyDeletedPage } from "@/lib/schemas/local-page.ts";

/**
 * Dev disk mode's write engine: observes the content collections
 * (`subscribeChanges` — post-commit, off the keystroke path) and
 * debounce-flushes changed pages to `content/pages/**.md` through the same
 * export pipeline as Save-all. Deletes call the `deletePage` server fn.
 * Serialization is server-side, so remark never runs while typing.
 */

const IDLE_FLUSH_MS = 400;
const MAX_WAIT_MS = 2000;
const RETRY_MS = 3000;

interface PendingFlush {
  idleTimer: number;
  maxTimer: number | null;
}

const pending = new Map<string, PendingFlush>();
const inFlight = new Set<string>();

function clearPending(pageId: string): void {
  const entry = pending.get(pageId);
  if (!entry) {
    return;
  }
  window.clearTimeout(entry.idleTimer);
  if (entry.maxTimer !== null) {
    window.clearTimeout(entry.maxTimer);
  }
  pending.delete(pageId);
}

async function flushPage(pageId: string): Promise<void> {
  clearPending(pageId);
  if (inFlight.has(pageId)) {
    // A flush is running; re-arm so the newest state lands right after it.
    schedulePageFlush(pageId);
    return;
  }
  const localPage = localPagesCollection.get(pageId);
  if (!localPage || isLocallyDeletedPage(localPage)) {
    return;
  }
  inFlight.add(pageId);
  try {
    const { contentHash } = await flushLocalPageToSource(localPage);
    recordOwnWrite(contentHash);
  } catch (error) {
    reportPersistenceError(error);
    window.setTimeout(() => schedulePageFlush(pageId), RETRY_MS);
  } finally {
    inFlight.delete(pageId);
  }
}

function schedulePageFlush(pageId: string): void {
  if (isTemplatePageId(pageId)) {
    return;
  }
  const existing = pending.get(pageId);
  if (existing) {
    window.clearTimeout(existing.idleTimer);
    existing.idleTimer = window.setTimeout(
      () => flushPage(pageId),
      IDLE_FLUSH_MS
    );
    return;
  }
  pending.set(pageId, {
    idleTimer: window.setTimeout(() => flushPage(pageId), IDLE_FLUSH_MS),
    maxTimer: window.setTimeout(() => flushPage(pageId), MAX_WAIT_MS),
  });
}

async function deletePageFile(pageId: string): Promise<void> {
  clearPending(pageId);
  try {
    await deletePage({ data: { pageId } });
  } catch (error) {
    reportPersistenceError(error);
  }
}

const pendingDatabases = new Map<string, number>();
const databasesInFlight = new Set<string>();

async function flushDatabase(databaseId: string): Promise<void> {
  const timer = pendingDatabases.get(databaseId);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    pendingDatabases.delete(databaseId);
  }
  if (databasesInFlight.has(databaseId)) {
    scheduleDatabaseFlush(databaseId);
    return;
  }
  const database = localDatabasesCollection.get(databaseId);
  if (!database) {
    return;
  }
  databasesInFlight.add(databaseId);
  try {
    const { contentHashes } = await flushLocalDatabaseToSource(database);
    for (const hash of contentHashes) {
      recordOwnWrite(hash);
    }
  } catch (error) {
    reportPersistenceError(error);
    window.setTimeout(() => scheduleDatabaseFlush(databaseId), RETRY_MS);
  } finally {
    databasesInFlight.delete(databaseId);
  }
}

function scheduleDatabaseFlush(databaseId: string): void {
  const existing = pendingDatabases.get(databaseId);
  if (existing !== undefined) {
    window.clearTimeout(existing);
  }
  pendingDatabases.set(
    databaseId,
    window.setTimeout(() => flushDatabase(databaseId), IDLE_FLUSH_MS)
  );
}

/** True while a flush for the page is queued or on the wire. */
export function hasPendingFlush(pageId: string): boolean {
  return pending.has(pageId) || inFlight.has(pageId);
}

let started = false;

/** Idempotent; called from the dev content-sync effect on mount. */
export function startDevDiskSync(): void {
  if (started || !isDevDiskMode() || typeof window === "undefined") {
    return;
  }
  started = true;

  localBlocksCollection.subscribeChanges((changes) => {
    for (const change of changes) {
      const pageId = change.value?.pageId;
      if (pageId) {
        schedulePageFlush(pageId);
      }
    }
  });

  localDatabasesCollection.subscribeChanges((changes) => {
    for (const change of changes) {
      const databaseId = change.value?.id ?? String(change.key);
      if (databaseId) {
        scheduleDatabaseFlush(databaseId);
      }
    }
  });

  localDatabaseRowsCollection.subscribeChanges((changes) => {
    for (const change of changes) {
      const databaseId =
        change.value?.databaseId ??
        localDatabaseRowsCollection.get(String(change.key))?.databaseId;
      if (databaseId) {
        scheduleDatabaseFlush(databaseId);
      }
    }
  });

  localPagesCollection.subscribeChanges((changes) => {
    for (const change of changes) {
      if (change.type === "delete") {
        deletePageFile(String(change.key));
        continue;
      }
      const page = change.value;
      if (!page) {
        continue;
      }
      if (isLocallyDeletedPage(page)) {
        deletePageFile(page.id);
        continue;
      }
      schedulePageFlush(page.id);
    }
  });
}
