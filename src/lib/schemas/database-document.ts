import { z } from "zod";

import {
  localDatabaseRowSchema,
  localDatabaseSchema,
} from "@/lib/schemas/database.ts";

/**
 * Shipped (repo JSON) database document — `content/databases/{id}.json`.
 * Derived from the local collection schemas the way `pageSchema` relates to
 * `localPageSchema`: local-only bookkeeping never ships.
 *
 * - Definition drops `createdAt`/`updatedAt` (local timestamps) and
 *   `serverBaselineHash` (the seeder's own marker).
 * - Rows drop `databaseId` (implied by the document), `pageId` (a pointer to
 *   a locally-materialized row page), `externalId` (connector rows are
 *   runtime data — the sync engine repopulates them client-side from the
 *   shipped `source` config), and local timestamps.
 */
export const shippedDatabaseRowSchema = localDatabaseRowSchema.omit({
  databaseId: true,
  pageId: true,
  externalId: true,
  createdAt: true,
  updatedAt: true,
});

export type ShippedDatabaseRow = z.infer<typeof shippedDatabaseRowSchema>;

export const shippedDatabaseDefinitionSchema = localDatabaseSchema.omit({
  serverBaselineHash: true,
  createdAt: true,
  updatedAt: true,
});

export type ShippedDatabaseDefinition = z.infer<
  typeof shippedDatabaseDefinitionSchema
>;

export const databaseDocumentSchema = z.object({
  database: shippedDatabaseDefinitionSchema,
  rows: z.array(shippedDatabaseRowSchema),
});

export type DatabaseDocument = z.infer<typeof databaseDocumentSchema>;
