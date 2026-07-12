import type { LocalDatabase } from "@/lib/schemas/database.ts";

export type ShippedDatabaseAction =
  /** No local copy — seed it. */
  | "insert"
  /** Local copy is unedited and the shipped content changed — swap it out. */
  | "replace"
  /** User deleted this shipped database; never resurrect it. */
  | "skip-tombstoned"
  /** Local copy still matches the shipped baseline. */
  | "skip-up-to-date"
  /** A local database owns this id (no shipped baseline) — never clobber. */
  | "skip-user-owned"
  /** Shipped content changed but so did the local copy — local wins (v1). */
  | "skip-edited";

/**
 * Per-database seeding decision, mirroring the pages model: pristine copies
 * track deploys automatically, anything the user touched is theirs until they
 * resolve it. Pure — the seeder supplies the hashes.
 *
 * `localCurrentHash` is `hashDatabaseDocument(exportDatabaseDocument(local,
 * rows))` — comparing it to the recorded `serverBaselineHash` detects local
 * edits without any dirty-flag bookkeeping on the write paths.
 */
export function resolveShippedDatabaseAction(input: {
  local: LocalDatabase | null;
  localCurrentHash: string | null;
  shippedHash: string;
  tombstoned: boolean;
}): ShippedDatabaseAction {
  if (input.tombstoned) {
    return "skip-tombstoned";
  }
  if (!input.local) {
    return "insert";
  }
  if (input.local.serverBaselineHash == null) {
    return "skip-user-owned";
  }
  if (input.local.serverBaselineHash === input.shippedHash) {
    return "skip-up-to-date";
  }
  if (input.localCurrentHash === input.local.serverBaselineHash) {
    return "replace";
  }
  return "skip-edited";
}
