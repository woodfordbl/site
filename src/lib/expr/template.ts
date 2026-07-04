/**
 * `{{ … }}` template splitting and evaluation for text blocks — powers
 * `{{ thisPage.X }}` tokens in row-page templates (and, later, inline live
 * tokens in prose).
 */

import {
  type ExprScope,
  evaluateExpression,
  exprError,
} from "@/lib/expr/evaluate.ts";
import { exprValueToDisplay } from "@/lib/expr/format-result.ts";
import { parseExpression } from "@/lib/expr/parse.ts";

/** One span of a template: literal text or an embedded expression source. */
export type TemplateSegment =
  | { kind: "text"; text: string }
  | { kind: "expr"; source: string };

const OPEN_DELIMITER = "{{";
const CLOSE_DELIMITER = "}}";

/**
 * Split a text-block string into literal text and `{{ … }}` expression
 * spans. Expression `source` is the trimmed inner text. An unterminated
 * `{{` is literal text (no escape syntax in v1). The empty string yields no
 * segments; adjacent tokens yield back-to-back `expr` segments.
 */
export function splitTemplateText(text: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf(OPEN_DELIMITER, index);
    const close =
      open === -1
        ? -1
        : text.indexOf(CLOSE_DELIMITER, open + OPEN_DELIMITER.length);
    if (open === -1 || close === -1) {
      segments.push({ kind: "text", text: text.slice(index) });
      return segments;
    }
    if (open > index) {
      segments.push({ kind: "text", text: text.slice(index, open) });
    }
    segments.push({
      kind: "expr",
      source: text.slice(open + OPEN_DELIMITER.length, close).trim(),
    });
    index = close + CLOSE_DELIMITER.length;
  }
  return segments;
}

/**
 * Render a template string against a scope: literal text passes through and
 * every `{{ … }}` span is parsed, evaluated, and display-formatted (errors —
 * including parse errors — render inline as "⚠ message"). Never throws.
 */
export function evaluateTemplateText(text: string, scope: ExprScope): string {
  const parts: string[] = [];
  for (const segment of splitTemplateText(text)) {
    if (segment.kind === "text") {
      parts.push(segment.text);
      continue;
    }
    const parsed = parseExpression(segment.source);
    if (!parsed.ok) {
      parts.push(exprValueToDisplay(exprError(parsed.error.message)));
      continue;
    }
    parts.push(exprValueToDisplay(evaluateExpression(parsed.ast, scope)));
  }
  return parts.join("");
}
