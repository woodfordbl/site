/**
 * @fileoverview The editor's result-type badge label.
 *
 * Display only: it collapses what a checked `resultType` should READ as, and
 * never feeds back into checking, so a badge may hide detail (a suppressed
 * blank member) the type still carries.
 */
import { type FormulaType, formulaTypeName } from "@/lib/formula/types.ts";

/**
 * Short human label for the editor's result-type badge — "number", "text",
 * "list of numbers", "boolean", "unknown". Unions read "number or text",
 * with a blank member suppressed (`if(x, 1)` badges "number", not "number
 * or blank" — display only, `resultType` keeps the full union); the internal
 * `error` and `typevar` kinds never reach users and read "unknown".
 */
export function formulaTypeBadge(type: FormulaType): string {
  if (type.kind === "error" || type.kind === "typevar") {
    return "unknown";
  }
  if (type.kind === "union") {
    const visible = type.members.filter((member) => member.kind !== "blank");
    if (visible.length > 0 && visible.length < type.members.length) {
      const shown: FormulaType =
        visible.length === 1 ? visible[0] : { kind: "union", members: visible };
      return formulaTypeName(shown);
    }
  }
  return formulaTypeName(type);
}
