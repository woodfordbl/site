import type {
  ConnectorDefinition,
  ConnectorFieldDef,
} from "@/lib/connectors/types.ts";
import { createDatabaseField } from "@/lib/databases/field-defs.ts";
import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Seed builder for connector-synced databases: schema and source only, no
 * rows — the first sync fills them (and synced rows never get a `pageId`;
 * synced tables are plain tables).
 */

/**
 * Generate a `DatabaseField` (fresh id) for one connector column, tagged with
 * its `sourceKey` and per-type config. Exported for the sync engine, which
 * reconciles newly-appearing connector columns into an existing schema.
 */
export function connectorFieldToDatabaseField(
  def: ConnectorFieldDef
): DatabaseField {
  const field = createDatabaseField(def.type, def.name);
  field.sourceKey = def.sourceKey;
  if (field.type === "number") {
    field.format = def.numberFormat;
    if (def.currencyCode) {
      field.currencyCode = def.currencyCode;
    }
    if (def.captureHistory) {
      field.captureHistory = true;
    }
  }
  if (field.type === "select" || field.type === "multiSelect") {
    field.options = def.options ?? [];
  }
  return field;
}

/**
 * Build the database definition for a new synced table: fields from
 * `connector.fields(config)` (each carrying its `sourceKey`), the primary
 * field resolved by `primarySourceKey` (falling back to the first field),
 * `source: { kind: "connector", … }`, one default "Table" view, and an empty
 * rows array. `parsedConfig` must already be validated by the connector's
 * `configSchema`.
 */
export function buildSyncedDatabaseSeed(
  connector: ConnectorDefinition,
  parsedConfig: Record<string, unknown>,
  name?: string
): { database: LocalDatabase; rows: LocalDatabaseRow[] } {
  const now = new Date().toISOString();
  const fields = connector
    .fields(parsedConfig)
    .map(connectorFieldToDatabaseField);
  const primaryField =
    fields.find((field) => field.sourceKey === connector.primarySourceKey) ??
    fields[0];
  const database: LocalDatabase = {
    id: crypto.randomUUID(),
    name: name ?? connector.title,
    icon: connector.icon,
    primaryFieldId: primaryField.id,
    source: {
      kind: "connector",
      connectorId: connector.id,
      config: parsedConfig,
    },
    fields,
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
  return { database, rows: [] };
}
