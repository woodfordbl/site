import { z } from "zod";
import { blockColorSchema } from "./rich-text.ts";

/**
 * Notion-style database schemas. A database is a workspace-level entity (like
 * a page): the definition here owns typed fields and saved views; rows live in
 * a separate sharded collection (`localDatabaseRowsCollection`). Canvas
 * `database` blocks only reference a database by id — rows never enter the
 * block tree. See docs/proposals/notion-style-databases.md.
 */

export const databaseFieldTypeSchema = z.enum([
  "text",
  "number",
  "checkbox",
  "select",
  "multiSelect",
  "date",
  "url",
]);

export type DatabaseFieldType = z.infer<typeof databaseFieldTypeSchema>;

/** Option for `select` / `multiSelect` fields; cell values store option ids. */
export const databaseSelectOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: blockColorSchema.optional(),
});

export type DatabaseSelectOption = z.infer<typeof databaseSelectOptionSchema>;

export const databaseNumberFormatSchema = z.enum([
  "plain",
  "integer",
  "percent",
  "currency",
]);

export type DatabaseNumberFormat = z.infer<typeof databaseNumberFormatSchema>;

const databaseFieldBaseSchema = z.object({
  /** Stable id — row values key on this, so renames never rewrite rows. */
  id: z.string(),
  name: z.string(),
  type: databaseFieldTypeSchema,
  /**
   * Optional custom glyph (emoji or `tabler:IconName`, matching page icons).
   * Falls back to the field-type icon when unset.
   */
  icon: z.string().optional(),
});

/**
 * Field definitions as a discriminated union so per-type config stays typed.
 * Config lives flat on the field (mirroring block props), not in a nested
 * `config` object, to keep cell editors and menus simple.
 */
export const databaseFieldSchema = z.discriminatedUnion("type", [
  databaseFieldBaseSchema.extend({ type: z.literal("text") }),
  databaseFieldBaseSchema.extend({
    type: z.literal("number"),
    format: databaseNumberFormatSchema.optional(),
  }),
  databaseFieldBaseSchema.extend({ type: z.literal("checkbox") }),
  databaseFieldBaseSchema.extend({
    type: z.literal("select"),
    options: z.array(databaseSelectOptionSchema).default([]),
  }),
  databaseFieldBaseSchema.extend({
    type: z.literal("multiSelect"),
    options: z.array(databaseSelectOptionSchema).default([]),
  }),
  databaseFieldBaseSchema.extend({ type: z.literal("date") }),
  databaseFieldBaseSchema.extend({ type: z.literal("url") }),
]);

export type DatabaseField = z.infer<typeof databaseFieldSchema>;

/**
 * One cell value. Interpretation is field-typed: `text`/`url` → string,
 * `number` → number, `checkbox` → boolean, `select` → option id string,
 * `multiSelect` → option id array, `date` → ISO date string. `null` and
 * missing keys both mean empty.
 */
export const databaseCellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export type DatabaseCellValue = z.infer<typeof databaseCellValueSchema>;

export const databaseFilterOperatorSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "gt",
  "lt",
  "gte",
  "lte",
  "before",
  "after",
  "onOrBefore",
  "onOrAfter",
  "isEmpty",
  "isNotEmpty",
]);

export type DatabaseFilterOperator = z.infer<
  typeof databaseFilterOperatorSchema
>;

/** Leaf condition: one field, one operator, an optional comparison value. */
export const databaseFilterConditionSchema = z.object({
  /** Stable id so filter-bar chips can be edited/removed in place. */
  id: z.string(),
  fieldId: z.string(),
  operator: databaseFilterOperatorSchema,
  value: databaseCellValueSchema.optional(),
});

export type DatabaseFilterCondition = z.infer<
  typeof databaseFilterConditionSchema
>;

export const databaseFilterGroupOpSchema = z.enum(["and", "or"]);

export type DatabaseFilterGroupOp = z.infer<typeof databaseFilterGroupOpSchema>;

/** Inner group — conditions only, enforcing the two-level nesting cap. */
export const databaseFilterInnerGroupSchema = z.object({
  id: z.string(),
  op: databaseFilterGroupOpSchema,
  conditions: z.array(databaseFilterConditionSchema),
});

export type DatabaseFilterInnerGroup = z.infer<
  typeof databaseFilterInnerGroupSchema
>;

/**
 * Root filter: `and`/`or` over conditions and at most one nesting level of
 * inner groups (Notion's cap — keeps the compiler and the chip UI simple).
 */
export const databaseFilterGroupSchema = z.object({
  op: databaseFilterGroupOpSchema,
  conditions: z.array(
    z.union([databaseFilterConditionSchema, databaseFilterInnerGroupSchema])
  ),
});

export type DatabaseFilterGroup = z.infer<typeof databaseFilterGroupSchema>;

export const databaseSortSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(["asc", "desc"]),
});

export type DatabaseSort = z.infer<typeof databaseSortSchema>;

/** Footer aggregate taxonomy (Notion's Calculate row). */
export const databaseAggregateFnSchema = z.enum([
  "countAll",
  "countValues",
  "countUnique",
  "countEmpty",
  "countNotEmpty",
  "percentEmpty",
  "percentNotEmpty",
  "sum",
  "average",
  "median",
  "min",
  "max",
  "range",
  "earliest",
  "latest",
]);

export type DatabaseAggregateFn = z.infer<typeof databaseAggregateFnSchema>;

export const databaseViewTypeSchema = z.enum(["table"]);

export type DatabaseViewType = z.infer<typeof databaseViewTypeSchema>;

/** Per-view table configuration — all keyed by stable field id. */
export const databaseTableViewConfigSchema = z.object({
  /** Column display order; fields absent from the list append after, in schema order. */
  columnOrder: z.array(z.string()).optional(),
  /** Column widths in pixels. */
  columnWidths: z.record(z.string(), z.number().positive()).optional(),
  /** Freeze boundary: columns pinned to the left edge, in order. */
  pinnedFieldIds: z.array(z.string()).optional(),
  /** Active Calculate-row aggregate per field. */
  calculations: z.record(z.string(), databaseAggregateFnSchema).optional(),
  /** Per-column wrap (true) vs single-line truncate (default). */
  wrapFieldIds: z.array(z.string()).optional(),
});

export type DatabaseTableViewConfig = z.infer<
  typeof databaseTableViewConfigSchema
>;

export const databaseViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: databaseViewTypeSchema,
  filter: databaseFilterGroupSchema.optional(),
  sorts: z.array(databaseSortSchema).optional(),
  /** Hidden fields stay in the schema and other views. */
  visibleFieldIds: z.array(z.string()).optional(),
  config: databaseTableViewConfigSchema.default({}),
});

export type DatabaseView = z.infer<typeof databaseViewSchema>;

/** One database definition row in `localDatabasesCollection`. */
export const localDatabaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Emoji or `tabler:IconName`, matching page icons. */
  icon: z.string().optional(),
  /** The title-like field; every database has exactly one. Names row pages. */
  primaryFieldId: z.string(),
  fields: z.array(databaseFieldSchema),
  views: z.array(databaseViewSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LocalDatabase = z.infer<typeof localDatabaseSchema>;

/** One row in `localDatabaseRowsCollection` (sharded per database). */
export const localDatabaseRowSchema = z.object({
  id: z.string(),
  databaseId: z.string(),
  /** Sparse per-field values keyed by field id; missing/null = empty. */
  values: z.record(z.string(), databaseCellValueSchema),
  /**
   * Sparse manual sort key (sidebarOrder pattern). Drag-reorder is only
   * offered when the active view has no sorts.
   */
  order: z.number().optional(),
  /** Lazily-created nested page; null until the row is first opened as a page. */
  pageId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LocalDatabaseRow = z.infer<typeof localDatabaseRowSchema>;
