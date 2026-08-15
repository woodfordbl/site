import type { ReactNode } from "react";
import { codeThemeTokenVariable } from "@/lib/code/code-theme-colors.ts";
import {
  highlightToHtml,
  useCodeThemeRevision,
  useHighlighterReady,
} from "@/lib/code/highlighter.ts";
import { highlightFormula } from "@/lib/formula/highlight.ts";

/**
 * Live samples for the code-theme setting: a fenced code block (Shiki), a
 * formula (our own tokenizer), and an inline code span. All three read the
 * ACTIVE theme — Shiki paints its own tokens, the other two consume the
 * `--code-token-*` variables the theme publishes — so this is the real thing
 * rather than a mock of it, and switching the picker repaints it.
 */

const CODE_SAMPLE = `function total(items) {
  const sum = items.reduce((a, b) => a + b, 0);
  return sum >= 100 ? "bulk" : sum;
}`;

/**
 * Chosen to exercise every token kind the resolver maps: a comment, a call,
 * properties, an operator chain, a number, a string, a `let` name, and a word
 * constant.
 */
const FORMULA_SAMPLE = `// Billable amount, rounded to cents.
let amount = thisPage.Estimate * thisPage.Rate;
if(amount >= 100, "bulk", round(amount, 2))`;

/** One tokenizer-classified run of the formula sample. */
function FormulaTokens({ source }: { source: string }): ReactNode {
  const spans = highlightFormula(source);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [index, span] of spans.entries()) {
    if (span.start > cursor) {
      parts.push(source.slice(cursor, span.start));
    }
    parts.push(
      <span
        key={`${span.start}-${index}`}
        style={{
          color: `var(${codeThemeTokenVariable(span.kind)}, currentColor)`,
          ...(span.kind === "comment" ? { fontStyle: "italic" } : {}),
        }}
      >
        {source.slice(span.start, span.end)}
      </span>
    );
    cursor = span.end;
  }
  if (cursor < source.length) {
    parts.push(source.slice(cursor));
  }
  return parts;
}

/**
 * One labelled sample. The label sits close to its own block and the sections
 * are spaced further apart, so the three read as three groups rather than six
 * evenly-spaced lines.
 */
function PreviewSection({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

/** Shared surface for the two multi-line samples. */
const SAMPLE_SURFACE_CLASS =
  "code-no-ligatures overflow-x-auto rounded-md bg-muted px-3 py-2.5 text-xs leading-[1.7]";

export function CodeThemePreview(): ReactNode {
  // Repaint when the highlighter resolves and whenever the theme changes.
  useHighlighterReady();
  useCodeThemeRevision();
  const codeHtml = highlightToHtml(CODE_SAMPLE, "typescript");

  return (
    <div className="flex flex-col gap-4">
      <PreviewSection label="Code block">
        <pre className={`code-shiki ${SAMPLE_SURFACE_CLASS}`}>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki highlighter output */}
          <code dangerouslySetInnerHTML={{ __html: codeHtml }} />
        </pre>
      </PreviewSection>
      <PreviewSection label="Formula">
        <pre className={`${SAMPLE_SURFACE_CLASS} font-mono`}>
          <FormulaTokens source={FORMULA_SAMPLE} />
        </pre>
      </PreviewSection>
      <PreviewSection label="Inline code">
        <p className="text-sm leading-relaxed">
          Filter rows where{" "}
          <span className="code-no-ligatures rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-[color:var(--code-foreground,inherit)]">
            status != "done"
          </span>{" "}
          to see what is left.
        </p>
      </PreviewSection>
    </div>
  );
}
