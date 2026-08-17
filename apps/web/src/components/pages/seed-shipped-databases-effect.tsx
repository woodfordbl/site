"use client";

import { useEffect } from "react";

import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { loadShippedDatabases } from "@/lib/content/load-databases.ts";
import { seedShippedDatabases } from "@/lib/databases/seed-shipped-databases.ts";
import { markShippedDatabasesSettled } from "@/lib/databases/shipped-databases-settled.ts";

let startedThisSession = false;

/**
 * Boot effect: fetch the shipped database documents and materialize them into
 * the local collections (see `seed-shipped-databases.ts` for the decision
 * table). Runs once per session, after both collections finish loading —
 * seeding against a half-loaded collection would misread "not seeded yet".
 * Always marks the settled store afterwards (success or failure) so gated
 * database blocks stop showing their loading placeholder.
 */
export function SeedShippedDatabasesEffect() {
  useEffect(() => {
    if (startedThisSession) {
      return;
    }
    startedThisSession = true;

    Promise.all([
      localDatabasesCollection.preload(),
      localDatabaseRowsCollection.preload(),
    ])
      .then(() => loadShippedDatabases())
      .then((entries) => {
        seedShippedDatabases(entries);
      })
      .catch(() => {
        // Offline / server error: blocks render whatever local data exists.
      })
      .finally(() => {
        markShippedDatabasesSettled();
      });
  }, []);

  return null;
}
