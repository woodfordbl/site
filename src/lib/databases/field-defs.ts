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
    // Formula cells filter on their evaluated display text (v1); typed
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
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

/** Human label for a filter operator, as shown on filter-bar chips. */
export function operatorLabel(op: DatabaseFilterOperator): string {
  return OPERATOR_LABELS[op];
}

/**
 * Whether the operator compares against a value. Emptiness checks
 * (`isEmpty`/`isNotEmpty`) are complete on their own.
 */
export function operatorNeedsValue(op: DatabaseFilterOperator): boolean {
  return op !== "isEmpty" && op !== "isNotEmpty";
}
