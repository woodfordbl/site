import { createDatabaseField } from "@/lib/databases/field-defs.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Seed content for a freshly created local database: the smallest useful
 * table a user can start typing into (Notion's new-database shape).
 */

const SEED_ROW_COUNT = 3;

/**
 * Build a new database definition plus its starter rows: fields Name
 * (text, primary), Tags (multi-select), Done (checkbox); one empty "Table"
 * view; three empty rows with manual order 1–3.
 */
export function createDefaultDatabaseSeed(name = "Untitled"): {
  database: LocalDatabase;
  rows: LocalDatabaseRow[];
} {
  const now = new Date().toISOString();
  const nameField = createDatabaseField("text", "Name");
  const tagsField = createDatabaseField("multiSelect", "Tags");
  const doneField = createDatabaseField("checkbox", "Done");
  const database: LocalDatabase = {
    id: crypto.randomUUID(),
    name,
    primaryFieldId: nameField.id,
    fields: [nameField, tagsField, doneField],
    views: [
      {
        id: crypto.randomUUID(),
        name: "Table",
        type: "table",
        config: {},
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  const rows: LocalDatabaseRow[] = [];
  for (let order = 1; order <= SEED_ROW_COUNT; order += 1) {
    rows.push({
      id: crypto.randomUUID(),
      databaseId: database.id,
      values: {},
      order,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { database, rows };
}
