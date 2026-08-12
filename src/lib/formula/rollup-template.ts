/**
 * Rollup templates for the v2 formula language (`lib/formula`) — proposal
 * §4.4 tier 2: rollups are NOT a field type, they're formulas a template
 * picker generates. Pure and React-free: given a relation field, an optional
 * target property, and an aggregation, {@link formulaRollupExpression}
 * produces canonical expression text built ONLY from real stdlib functions
 * (`map`/`filter`/`sum`/`sort`/… — see `catalog.ts`), so the sugar teaches
 * the language instead of hiding it.
 *
 * Member names that lex as a single identifier emit the dot form
 * (`r.Estimate`); anything else — spaces, punctuation, digits-first, or the
 * words the grammar/highlighter treat specially — emits the bracket member
 * form (`r["Story Points"]`) the parser accepts on any receiver. The
 * identifier-safe predicate runs the REAL tokenizer, so it can never drift
 * from what the grammar accepts after a `.`.
 */

import { canonicalPropertyReference } from "@/lib/formula/ref-rewrite.ts";
import { tokenizeFormula } from "@/lib/formula/tokenize.ts";
import type { FormulaType } from "@/lib/formula/types.ts";

/** One rollup aggregation the template picker offers. */
export type FormulaRollupAggregation =
  | "average"
  | "countAll"
  | "countChecked"
  | "countValues"
  | "earliest"
  | "latest"
  | "max"
  | "min"
  | "showAll"
  | "sum";

/** One aggregation choice, with the copy the picker UI shows. */
export interface FormulaRollupAggregationOption {
  /** One sentence, sentence case — the picker's detail/hover copy. */
  readonly description: string;
  readonly id: FormulaRollupAggregation;
  readonly label: string;
}

/** Inputs of {@link formulaRollupExpression}. */
export interface FormulaRollupTemplate {
  readonly aggregation: FormulaRollupAggregation;
  /**
   * The target property's NAME (member access resolves by name — the same
   * id-then-name rule `resolveFormulaRowMember` applies), or `null` for
   * aggregations over the relation itself (`countAll`).
   */
  readonly memberName: string | null;
  /** The relation field's id — emitted as the canonical `prop("<id>")`. */
  readonly relationFieldId: string;
}

const NUMBER_OPTIONS: readonly FormulaRollupAggregationOption[] = [
  { id: "sum", label: "Sum", description: "Adds up the values." },
  {
    id: "average",
    label: "Average",
    description: "The arithmetic mean of the values.",
  },
  { id: "min", label: "Min", description: "The smallest value." },
  { id: "max", label: "Max", description: "The largest value." },
];

const DATE_OPTIONS: readonly FormulaRollupAggregationOption[] = [
  {
    id: "earliest",
    label: "Earliest date",
    description: "The earliest of the dates.",
  },
  {
    id: "latest",
    label: "Latest date",
    description: "The latest of the dates.",
  },
];

const CHECKBOX_OPTIONS: readonly FormulaRollupAggregationOption[] = [
  {
    id: "countChecked",
    label: "Count checked",
    description: "How many related rows are checked.",
  },
];

const ANY_MEMBER_OPTIONS: readonly FormulaRollupAggregationOption[] = [
  {
    id: "countValues",
    label: "Count non-empty",
    description: "How many related rows have a value.",
  },
  {
    id: "showAll",
    label: "Show all",
    description: "The values as a list, one per related row.",
  },
];

const NO_MEMBER_OPTIONS: readonly FormulaRollupAggregationOption[] = [
  {
    id: "countAll",
    label: "Count rows",
    description: "How many rows are linked.",
  },
];

/**
 * The single scalar kind a member's value type settles to, blank union
 * members ignored (an `if(x, 1)` formula member is number|blank and still
 * offers the number aggregations — matching `formulaTypeBadge`'s display
 * rule). Anything else — text, lists, mixed unions, unknown — gets only the
 * type-agnostic options.
 */
function rollupMemberKind(
  type: FormulaType
): "boolean" | "date" | "number" | "other" {
  const visible =
    type.kind === "union"
      ? type.members.filter((member) => member.kind !== "blank")
      : [type];
  const only = visible.length === 1 ? visible[0] : undefined;
  switch (only?.kind) {
    case "number":
    case "date":
    case "boolean":
      return only.kind;
    default:
      return "other";
  }
}

/**
 * The aggregations offered for a member of the given value type — `null`
 * meaning "no member, the relation itself". Type-specific options first
 * (number → sum/average/min/max, date → earliest/latest, checkbox → count
 * checked), then the options every member supports.
 */
export function formulaRollupAggregationsFor(
  memberType: FormulaType | null
): readonly FormulaRollupAggregationOption[] {
  if (memberType === null) {
    return NO_MEMBER_OPTIONS;
  }
  switch (rollupMemberKind(memberType)) {
    case "number":
      return [...NUMBER_OPTIONS, ...ANY_MEMBER_OPTIONS];
    case "date":
      return [...DATE_OPTIONS, ...ANY_MEMBER_OPTIONS];
    case "boolean":
      return [...CHECKBOX_OPTIONS, ...ANY_MEMBER_OPTIONS];
    default:
      return ANY_MEMBER_OPTIONS;
  }
}

/**
 * Words that lex as one identifier but read specially after a `.` — the
 * grammar's keyword literals/operators, the scope roots, and the `prop`
 * reference root — so member access on a field named one of them emits the
 * unambiguous bracket form.
 */
const MEMBER_UNSAFE_WORDS = new Set([
  "true",
  "false",
  "null",
  "and",
  "or",
  "not",
  "thispage",
  "thisrow",
  "prop",
]);

/**
 * Whether `name` can follow a `.` as-is: the whole string lexes as exactly
 * one identifier token (the tokenizer is the single grammar truth — no
 * regex to drift) and isn't a specially-read word.
 */
function isIdentifierSafeMemberName(name: string): boolean {
  const lexed = tokenizeFormula(name);
  if (!lexed.ok || lexed.tokens.length !== 2) {
    return false;
  }
  const token = lexed.tokens[0];
  return (
    token.type === "identifier" &&
    token.value === name &&
    !MEMBER_UNSAFE_WORDS.has(name.toLowerCase())
  );
}

/** Escape a name for a formula string literal (same rule as `prop("…")`). */
function quotedName(name: string): string {
  return `"${name.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** `r.Name` for identifier-safe names, `r["Any Name"]` otherwise. */
function memberAccess(parameter: string, name: string): string {
  return isIdentifierSafeMemberName(name)
    ? `${parameter}.${name}`
    : `${parameter}[${quotedName(name)}]`;
}

/**
 * Generate the canonical rollup expression. The relation reference is the
 * canonical `prop("<id>")` form (rename-proof; chips immediately in the
 * editor). A `null` member always generates the row count — the only
 * aggregation that needs no member — so the function is total.
 */
export function formulaRollupExpression(
  template: FormulaRollupTemplate
): string {
  const relation = canonicalPropertyReference(template.relationFieldId);
  const { aggregation, memberName } = template;
  if (memberName === null || aggregation === "countAll") {
    return `${relation}.length()`;
  }
  const member = memberAccess("r", memberName);
  const values = `${relation}.map(r => ${member})`;
  switch (aggregation) {
    case "sum":
    case "average":
    case "min":
    case "max":
      return `${values}.${aggregation}()`;
    case "earliest":
      // sort() puts blanks last, so first() is the earliest non-blank date.
      return `${values}.sort().first()`;
    case "latest":
      // Blanks would sort last and win last(); drop them first.
      return `${values}.filter(v => !empty(v)).sort().last()`;
    case "countChecked":
      return `${relation}.filter(r => ${member}).length()`;
    case "countValues":
      return `${values}.filter(v => !empty(v)).length()`;
    default:
      return values;
  }
}
