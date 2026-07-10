import { useIsClient } from "@/hooks/use-is-client.ts";
import { useShippedDatabasesSettled } from "@/lib/databases/shipped-databases-settled.ts";

/**
 * Gate for mounting `DatabaseTableView` from a block. Two reasons a linked
 * database block must not render its table immediately:
 *
 * 1. SSR: the table view reads the local collections via `useLiveQuery`,
 *    which has no server snapshot — mounting it during a server render aborts
 *    the entire page render ("Missing getServerSnapshot") and silently
 *    reverts the site to a client-rendered empty shell.
 * 2. First visit: shipped databases seed into the local collections from a
 *    boot fetch; until that settles, the table would flash "This database
 *    was deleted." (with a Remove offer) for a database that is about to
 *    appear.
 *
 * Both signals are `useSyncExternalStore`-backed with `false` server
 * snapshots, so SSR and the hydration frame render the same placeholder.
 */
export function useDatabaseBlockReady(): boolean {
  const isClient = useIsClient();
  const shippedSettled = useShippedDatabasesSettled();
  return isClient && shippedSettled;
}

/** Neutral stand-in while the gate is closed (SSR + seed window). */
export function DatabaseBlockLoading() {
  return <div className="text-muted-foreground text-sm">Loading database…</div>;
}
