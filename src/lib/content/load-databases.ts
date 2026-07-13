import { createServerFn } from "@tanstack/react-start";

import {
  getShippedDatabases,
  type ShippedDatabaseEntry,
} from "@/lib/content/database-store.server.ts";

/**
 * Every shipped database document (definition + local rows) with its content
 * hash, in one round trip — the client seeder's input. Documents are small
 * (page-metadata scale), so no per-database endpoint is needed.
 */
export const loadShippedDatabases = createServerFn({ method: "GET" }).handler(
  (): Promise<ShippedDatabaseEntry[]> => getShippedDatabases()
);
