/**
 * Write path for Electric-backed collections: maps TanStack DB mutations to
 * `POST /api/sync/mutate` (one Postgres transaction per call, per-key jsonb
 * patches for updates) and holds optimistic overlays until the returned txid
 * comes back on each involved collection's shape stream.
 *
 * Used two ways:
 * - As the `onInsert`/`onUpdate`/`onDelete` handlers of the electric
 *   collections (direct collection.insert/update/delete calls).
 * - As the `mutationFn` body of the explicit multi-collection transactions in
 *   the ops layer (block/database ops), replacing the local-mode
 *   `acceptMutations` persistence.
 */
import { isSyncedMode, syncContext } from "@/db/collections/sync-mode.ts";

/** Collection id → server table, for every synced collection. */
const TABLE_BY_COLLECTION_ID: Record<string, string> = {
  "local-pages": "pages",
  "local-blocks": "blocks",
  "local-databases": "databases",
  "local-database-rows": "database_rows",
};

interface WireMutation {
  doc?: Record<string, unknown>;
  id: string;
  op: "insert" | "update" | "delete";
  table: string;
}

interface CollectionLike {
  config: { id?: string };
  id?: string;
  utils: Record<string, unknown>;
}

export interface TransactionLike {
  mutations: Array<{
    collection: CollectionLike;
    changes: Record<string, unknown>;
    key: string | number;
    modified: Record<string, unknown>;
    type: "insert" | "update" | "delete";
  }>;
}

function collectionTable(collection: CollectionLike): string {
  const id = collection.id ?? collection.config.id ?? "";
  const table = TABLE_BY_COLLECTION_ID[id];
  if (!table) {
    throw new Error(`Collection ${id} is not synced`);
  }
  return table;
}

function toWireMutation(
  mutation: TransactionLike["mutations"][number]
): WireMutation {
  const table = collectionTable(mutation.collection);
  const id = String(mutation.key);
  if (mutation.type === "insert") {
    return { table, op: "insert", id, doc: mutation.modified };
  }
  if (mutation.type === "update") {
    return { table, op: "update", id, doc: mutation.changes };
  }
  return { table, op: "delete", id };
}

/**
 * Mutations are shipped strictly in submission order. Concurrent optimistic
 * transactions (every keystroke is one) would otherwise race their POSTs, and
 * an update can reach Postgres before the insert that creates its row —
 * matching zero rows, never appearing on the shape stream, and timing out the
 * optimistic overlay.
 */
let sendChain: Promise<unknown> = Promise.resolve();

function postMutations(mutations: WireMutation[]): Promise<number> {
  const send = async (): Promise<number> => {
    const workspaceId = syncContext.workspaceId;
    if (!workspaceId) {
      throw new Error("No active workspace for synced mutation");
    }
    const response = await fetch("/api/sync/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, mutations }),
    });
    if (!response.ok) {
      throw new Error(
        `mutate failed: ${response.status} ${await response.text()}`
      );
    }
    const result = (await response.json()) as { txid: number };
    return result.txid;
  };
  const queued = sendChain.then(send, send);
  sendChain = queued.catch(() => undefined);
  return queued;
}

type AwaitTxId = (txid: number) => Promise<unknown>;

/**
 * Ship a transaction's mutations to the server, then wait until every
 * involved collection has seen the txid on its own shape stream (each stream
 * carries the txid only on its own table's change messages).
 */
export async function pushTransactionMutations(
  transaction: TransactionLike
): Promise<void> {
  if (transaction.mutations.length === 0) {
    return;
  }
  const txid = await postMutations(transaction.mutations.map(toWireMutation));
  const involved = new Map<CollectionLike, AwaitTxId>();
  for (const mutation of transaction.mutations) {
    const awaitTxId = mutation.collection.utils.awaitTxId as
      | AwaitTxId
      | undefined;
    if (awaitTxId) {
      involved.set(
        mutation.collection,
        awaitTxId.bind(mutation.collection.utils) as AwaitTxId
      );
    }
  }
  await Promise.all([...involved.values()].map((wait) => wait(txid)));
}

/**
 * Sends a transaction to the server when this session is synced, reporting
 * whether it did. Local-mode callers must still hand their mutations to their
 * own collections, so the contract is a guard clause:
 * `if (await pushWhenSynced(transaction)) { return; }`.
 */
export async function pushWhenSynced(transaction: unknown): Promise<boolean> {
  if (!isSyncedMode()) {
    return false;
  }
  await pushTransactionMutations(transaction as TransactionLike);
  return true;
}

/**
 * Collection-level write handlers for electricCollectionOptions. The electric
 * collection awaits the returned txid against its own stream itself.
 */
export function syncedWriteHandlers(): {
  onDelete: (params: { transaction: TransactionLike }) => Promise<{
    txid: number;
  }>;
  onInsert: (params: { transaction: TransactionLike }) => Promise<{
    txid: number;
  }>;
  onUpdate: (params: { transaction: TransactionLike }) => Promise<{
    txid: number;
  }>;
} {
  const handler = async ({ transaction }: { transaction: TransactionLike }) => {
    const txid = await postMutations(transaction.mutations.map(toWireMutation));
    return { txid };
  };
  return { onInsert: handler, onUpdate: handler, onDelete: handler };
}
