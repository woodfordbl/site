import { z } from "zod";
import { blockSchema } from "./block.ts";
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
  "formula",
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

/**
 * Date display format: `default` = "Jan 5, 2026", `long` = "January 5, 2026",
 * `relative` = "3 days ago" (re-rendered on the visible clock tick), `iso` =
 * the stored yyyy-mm-dd. Display-only — stored values stay ISO date strings.
 */
export const databaseDateFormatSchema = z.enum([
  "default",
  "long",
  "relative",
  "iso",
]);

export type DatabaseDateFormat = z.infer<typeof databaseDateFormatSchema>;

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
  /**
   * Connector column key this field is synced from. Present = the field's
   * values are written by the sync engine and read-only in the UI; absent =
   * a normal local field. Local fields are ALWAYS allowed on synced
   * databases — the sync diff only touches synced keys in `row.values`, so
   * user-added columns survive every refresh.
   */
  sourceKey: z.string().optional(),
  /**
   * When true on a numeric synced field, each changed value is appended to a
   * forward-only `{ t, v }` time series in the field-history store
   * (`src/db/history/field-history-store.ts`) as ticks/polls arrive. Powers
   * time-axis charts; ignored for non-numeric fields.
   */
  captureHistory: z.boolean().optional(),
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
    /** Fixed fraction digits (0-6); absent = format's natural precision. */
    decimals: z.number().int().min(0).max(6).optional(),
    /** Thousands separators in plain/integer displays; absent = on. */
    useGrouping: z.boolean().optional(),
    /** ISO 4217 code for the `currency` format's symbol; absent = USD. */
    currencyCode: z.string().optional(),
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
  databaseFieldBaseSchema.extend({
    type: z.literal("date"),
    /** Display format; absent = `default`. */
    format: databaseDateFormatSchema.optional(),
  }),
  databaseFieldBaseSchema.extend({ type: z.literal("url") }),
  databaseFieldBaseSchema.extend({
    type: z.literal("formula"),
    /**
     * Expression source (`lib/expr` grammar) evaluated per row with
     * `thisRow`/`thisPage` property scope. Computed at read time — formula
     * values never live in `row.values`, and formula cells are read-only.
     */
    expression: z.string().default(""),
  }),
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
  /** Date range: condition value is `[startIso, endIso]` (inclusive). */
  "between",
  /** Relative date windows — no value; evaluated against the current clock. */
  "pastDay",
  "pastWeek",
  "pastMonth",
  "pastYear",
  "thisWeek",
  "thisMonth",
  "nextWeek",
  "nextMonth",
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

export const databaseViewTypeSchema = z.enum([
  "table",
  "list",
  "board",
  "chart",
]);

export type DatabaseViewType = z.infer<typeof databaseViewTypeSchema>;

/**
 * Chart Y aggregates, in menu order — the single source for the `yAggregate`
 * schema enum and the settings menu's option list (`CHART_Y_AGGREGATES`).
 */
export const DATABASE_CHART_Y_AGGREGATES = [
  "count",
  "sum",
  "average",
  "min",
  "max",
] as const;

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
  /** Vertical cell separators; absent means shown. */
  showVerticalLines: z.boolean().optional(),
  /** Page icon in the primary (title) column cells; absent means shown. */
  showPageIcons: z.boolean().optional(),
  /**
   * Row-selection checkbox column: `always` reserves a leading column;
   * `hover` and `number` render controls in a left gutter (content stays
   * flush). Absent defaults to `hover`.
   */
  rowSelectDisplay: z.enum(["always", "hover", "number"]).optional(),
  /** Collapsed group keys (groupBy value keys) for this view. */
  collapsedGroupKeys: z.array(z.string()).optional(),
  /** Group buckets hidden from this grouped view (groupBy value keys). */
  hiddenGroupKeys: z.array(z.string()).optional(),
  /** Board (kanban) settings — used when `view.type` is `board`. */
  board: z
    .object({
      /** Select field whose options become the columns. */
      groupFieldId: z.string().optional(),
      /** Fields shown on cards besides the primary title. */
      cardFieldIds: z.array(z.string()).optional(),
      /** Hide board columns for these option ids. */
      hiddenColumnIds: z.array(z.string()).optional(),
      /**
       * Column ordering: `manual` follows the select field's option order
       * (default), `alphabetical` sorts columns by option name, `color`
       * groups columns by option color (palette order). The "No <field>"
       * empty column always stays last regardless.
       */
      columnSort: z.enum(["manual", "alphabetical", "color"]).optional(),
      /** Hide columns that currently hold no cards. */
      hideEmptyColumns: z.boolean().optional(),
    })
    .optional(),
  /** Chart settings — used when `view.type` is `chart`. */
  chart: z
    .object({
      mark: z.enum(["bar", "line", "area", "pie"]).optional(),
      /**
       * X axis mode. `category` (default) buckets by a groupable field;
       * `time` plots a continuous time axis from captured field history
       * (`timeSeries` below), one series per synced row.
       */
      xMode: z.enum(["category", "time"]).optional(),
      /** Time-axis settings — used when `xMode` is `time`. */
      timeSeries: z
        .object({
          /** Captured numeric field (`captureHistory`) to plot over time. */
          fieldId: z.string(),
          /**
           * Y scale. `absolute` (default) plots raw values; `percent`
           * normalizes each series to its % change from the first in-window
           * point, so symbols of very different magnitude share one axis and
           * their movement is visible/comparable.
           */
          scale: z.enum(["absolute", "percent"]).optional(),
          /** Visible window in ms (e.g. 7d); absent = the default window. */
          windowMs: z.number().positive().optional(),
        })
        .optional(),
      /** X axis / category field. */
      xFieldId: z.string().optional(),
      /** Y aggregate: count of rows, or an aggregate over a number field. */
      yAggregate: z.enum(DATABASE_CHART_Y_AGGREGATES).optional(),
      yFieldId: z.string().optional(),
      /** Optional X axis title rendered under the axis (cartesian marks). */
      xAxisTitle: z.string().optional(),
      /** Optional Y axis title rendered along the axis (cartesian marks). */
      yAxisTitle: z.string().optional(),
      /** Optional series split (one line/bar-stack segment per value). */
      seriesFieldId: z.string().optional(),
      showLegend: z.boolean().optional(),
      legendPosition: z.enum(["top", "bottom", "right"]).optional(),
      /** Chart palette id from lib/charts (absent = site default). */
      palette: z.string().optional(),
      /** Per-series color overrides: series key → chart token index 1-5. */
      colorOverrides: z.record(z.string(), z.number()).optional(),
      showGrid: z.boolean().optional(),
      /** Draw vertical grid lines too (absent = horizontal only). */
      gridVertical: z.boolean().optional(),
      /** Target number of horizontal grid lines (absent = auto). 2–12. */
      gridCount: z.number().int().min(2).max(12).optional(),
      stacked: z.boolean().optional(),
    })
    .optional(),
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
  /**
   * Row grouping: rows bucket by this field's value (select option order
   * respected; empty values group last). Sorts apply within each group.
   */
  groupBy: z.object({ fieldId: z.string() }).optional(),
  /** Hidden fields stay in the schema and other views. */
  visibleFieldIds: z.array(z.string()).optional(),
  config: databaseTableViewConfigSchema.default({}),
});

export type DatabaseView = z.infer<typeof databaseViewSchema>;

/**
 * Where a database's rows come from. Absent/`local` = user-authored rows.
 * `connector` = rows pulled from an external service by the client-side sync
 * engine; `config` is validated by the connector's own zod schema at use
 * sites. Synced databases are plain tables — rows never require pages.
 */
/**
 * Arbitrary JSON value. Connector configs use this instead of `z.unknown()`
 * so documents containing a `source` stay type-level serializable — TanStack
 * server fns reject `unknown` in return types even when the runtime value is
 * plain JSON (shipped database documents travel through `loadShippedDatabases`).
 */
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const databaseSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local") }),
  z.object({
    kind: z.literal("connector"),
    connectorId: z.string(),
    config: z.record(z.string(), jsonValueSchema),
    /** Poll interval override in ms; connectors clamp to their own minimum. */
    refreshMs: z.number().positive().optional(),
  }),
]);

export type DatabaseSource = z.infer<typeof databaseSourceSchema>;

/** One database definition row in `localDatabasesCollection`. */
export const localDatabaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Emoji or `tabler:IconName`, matching page icons. */
  icon: z.string().optional(),
  /** The title-like field; every database has exactly one. Names row pages. */
  primaryFieldId: z.string(),
  /** Row origin; absent means a local (user-authored) database. */
  source: databaseSourceSchema.optional(),
  /**
   * Shared page template for rows-as-pages: blocks (with `{{ thisPage.X }}`
   * expression tokens in text) rendered VIRTUALLY when a row page opens.
   * Nothing is stored per row — a real page materializes copy-on-write only
   * when the user first edits a specific row's page. Absent = default
   * template (title + properties section).
   */
  rowTemplate: z.array(blockSchema).optional(),
  fields: z.array(databaseFieldSchema),
  views: z.array(databaseViewSchema),
  /**
   * `hashStableValue` of the shipped database document this local copy was
   * seeded from (pages' `serverBaselineHash` pattern). Absent on user-created
   * databases; the shipped-content seeder uses it to distinguish "unedited —
   * safe to replace on deploy" from "locally edited — keep".
   */
  serverBaselineHash: z.string().optional(),
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
  /**
   * Connector row identity: the provider's stable id for this record. Present
   * only on rows written by the sync engine (which diffs snapshots by this
   * key); local user-authored rows omit it. Synced rows never get pages.
   */
  externalId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LocalDatabaseRow = z.infer<typeof localDatabaseRowSchema>;
