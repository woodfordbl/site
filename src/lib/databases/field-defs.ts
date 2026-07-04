import type {
  DatabaseField,
  DatabaseFieldType,
  DatabaseFilterOperator,
} from "@/lib/schemas/database.ts";

/**
 * Per-type field definitions — the single data source for everything a
 * database field type declares besides its Zod schema and its React editors
 * (mirrors `lib/blocks/block-defs.ts`): display label, allowed filter
 * operators, default operator, and the cell value shape.
 */

/** The runtime shape a field type stores in `row.values`. */
export type DatabaseFieldValueKind =
  | "string"
  | "number"
  | "boolean"
  | "optionId"
  | "optionIds"
  | "isoDate";

/** Static metadata for one database field type. */
export interface DatabaseFieldTypeDef {
  /** Operator preselected when a new filter chip targets this field type. */
  defaultOperator: DatabaseFilterOperator;
  /** Sentence-case display label (e.g. "Multi-select"). */
  label: string;
  /** Filter operators offered for this field type, in menu order. */
  operators: readonly DatabaseFilterOperator[];
  /** Cell value shape — drives typed comparisons in filtering and sorting. */
  valueKind: DatabaseFieldValueKind;
}

const STRING_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
] as const satisfies readonly DatabaseFilterOperator[];

/**
 * Relative date-window operators, in menu order (past → this → next). They
 * carry no condition value — the window is computed from the current clock at
 * evaluation time (`row-filter.ts` documents the exact window semantics).
 */
const RELATIVE_DATE_OPERATORS = [
  "pastDay",
  "pastWeek",
  "pastMonth",
  "pastYear",
  "thisWeek",
  "thisMonth",
  "nextWeek",
  "nextMonth",
] as const satisfies readonly DatabaseFilterOperator[];

const RELATIVE_DATE_OPERATOR_SET: ReadonlySet<DatabaseFilterOperator> = new Set(
  RELATIVE_DATE_OPERATORS
);

/** Whether the operator is a clock-evaluated relative date window. */
export function isRelativeDateOperator(op: DatabaseFilterOperator): boolean {
  return RELATIVE_DATE_OPERATOR_SET.has(op);
}

/** Per-type field definitions keyed by `DatabaseFieldType`. */
export const FIELD_TYPE_DEFS: {
  [K in DatabaseFieldType]: DatabaseFieldTypeDef;
} = {
  text: {
    label: "Text",
    operators: STRING_OPERATORS,
    defaultOperator: "contains",
    valueKind: "string",
  },
  number: {
    label: "Number",
    operators: ["eq", "neq", "gt", "lt", "gte", "lte", "isEmpty", "isNotEmpty"],
    defaultOperator: "eq",
    valueKind: "number",
  },
  checkbox: {
    label: "Checkbox",
    operators: ["eq"],
    defaultOperator: "eq",
    valueKind: "boolean",
  },
  select: {
    label: "Select",
    operators: ["eq", "neq", "isEmpty", "isNotEmpty"],
    defaultOperator: "eq",
    valueKind: "optionId",
  },
  multiSelect: {
    label: "Multi-select",
    operators: ["contains", "notContains", "isEmpty", "isNotEmpty"],
    defaultOperator: "contains",
    valueKind: "optionIds",
  },
  date: {
    label: "Date",
    operators: [
      "eq",
      "before",
      "after",
      "onOrBefore",
      "onOrAfter",
      "between",
      ...RELATIVE_DATE_OPERATORS,
      "isEmpty",
      "isNotEmpty",
    ],
    defaultOperator: "eq",
    valueKind: "isoDate",
  },
  url: {
    label: "URL",
    operators: STRING_OPERATORS,
    defaultOperator: "contains",
    valueKind: "string",
  },
  formula: {
    label: "Formula",
    // Formula cells filter on their evaluated display text (v1) —
    // `row-filter.ts` projects the computed cell (string/number/boolean) to
    // the text the grid renders before applying string operators. Typed
    // operator sets per result kind come with formula-aware filtering.
    operators: [
      "eq",
      "neq",
      "contains",
      "notContains",
      "startsWith",
      "endsWith",
      "isEmpty",
      "isNotEmpty",
    ],
    defaultOperator: "contains",
    valueKind: "string",
  },
};

/**
 * Create a new field of the given type with per-type config defaults
 * (select/multi-select start with empty option lists).
 */
export function createDatabaseField(
  type: DatabaseFieldType,
  name: string
): DatabaseField {
  const id = crypto.randomUUID();
  switch (type) {
    case "select":
      return { id, name, type, options: [] };
    case "multiSelect":
      return { id, name, type, options: [] };
    case "formula":
      return { id, name, type, expression: "" };
    default:
      return { id, name, type };
  }
}

const OPERATOR_LABELS: Record<DatabaseFilterOperator, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  endsWith: "ends with",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  before: "is before",
  after: "is after",
  onOrBefore: "is on or before",
  onOrAfter: "is on or after",
  between: "is between",
  pastDay: "is in the last day",
  pastWeek: "is in the last week",
  pastMonth: "is in the last month",
  pastYear: "is in the last year",
  thisWeek: "is this week",
  thisMonth: "is this month",
  nextWeek: "is next week",
  nextMonth: "is next month",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

/** Human label for a filter operator, as shown on filter-bar chips. */
export function operatorLabel(op: DatabaseFilterOperator): string {
  return OPERATOR_LABELS[op];
}

/**
 * Whether the operator compares against a value. Emptiness checks
 * (`isEmpty`/`isNotEmpty`) and relative date windows (evaluated against the
 * clock) are complete on their own.
 */
export function operatorNeedsValue(op: DatabaseFilterOperator): boolean {
  return op !== "isEmpty" && op !== "isNotEmpty" && !isRelativeDateOperator(op);
}

/**
 * Whether the operator's condition value is a two-date range
 * (`[startIso, endIso]`) rather than a single scalar — true only for
 * `between`. Drives the dual-date value editor and range chip label.
 */
export function operatorNeedsRange(op: DatabaseFilterOperator): boolean {
  return op === "between";
}
