import { InlinePageLink } from "@/components/editor/inline-page-link.tsx";
import { InlineLink } from "@/components/editor/link-preview.tsx";
import { segmentRichText } from "@/lib/blocks/rich-text.ts";
import { inlineTokenUnderlineOffsetClassName } from "@/lib/editor/inline-token-rule.ts";
import { pageLinkTitleMarks } from "@/lib/editor/rich-text-dom.ts";
import { EMPTY_INLINE_FORMULA_LABEL } from "@/lib/formula/display.ts";
import type { InlineMark, InlineMarkType } from "@/lib/schemas/rich-text.ts";
import { cn } from "@/lib/utils.ts";

/** Presentation for each inline mark, shared by the view renderer and the editable surface. */
export const inlineMarkClassNames: Record<InlineMarkType, string> = {
  bold: "font-semibold",
  italic: "italic",
  underline: "underline underline-offset-2",
  strikethrough: "line-through",
  // Inline code takes the selected syntax theme's foreground (there is no
  // syntax to tokenize) over the app's own muted surface — the theme's
  // `editor.background` would fight the page. Ligatures off for the same
  // reason formula source turns them off: `!=` must not read as `≠`.
  code: "code-no-ligatures rounded bg-muted px-1 py-px font-mono text-[0.85em] text-[color:var(--code-foreground,inherit)]",
  link: "cursor-pointer text-primary underline underline-offset-2 hover:text-primary/80",
  /**
   * A formula token's run holds only the U+FFFC sentinel; the VALUE renders in
   * its place (see `docs/proposals/inline-prose-tokens.md`), so this styles the
   * container rather than any text of its own.
   *
   * Reads as prose, not as code: the value inherits the block's font and size
   * exactly the way an inline page link's title does, and wears the same
   * border-token underline as its only standing affordance. A long value
   * truncates rather than wrapping — `inline-block` is what makes `text-ellipsis`
   * apply at all, and the full text stays reachable on hover.
   */
  formula: cn(
    // `overflow-clip` (not `hidden`) still truncates a long value with an
    // ellipsis, but `overflow-clip-margin` lets the dotted underline — which
    // sits below a `leading-none` box — bleed out instead of being clipped
    // away with it.
    "inline-formula-token max-w-[16rem] cursor-pointer overflow-clip text-ellipsis whitespace-nowrap align-middle [overflow-clip-margin:0.4em]",
    // `leading-none` + `align-middle` keeps the value optically on the block's
    // text baseline; the residual pixel is corrected with a relative nudge
    // rather than a baseline-relative `vertical-align`.
    "relative -top-px inline-block text-[length:inherit] leading-none",
    "underline decoration-border decoration-dotted hover:decoration-muted-foreground",
    inlineTokenUnderlineOffsetClassName,
    // Blank results (`None`) drop the prose underline for a muted pill so the
    // token stays visible and clickable when Tags / text / etc. are empty.
    "data-[formula-empty]:rounded-md data-[formula-empty]:bg-muted data-[formula-empty]:px-1.5 data-[formula-empty]:py-0.5 data-[formula-empty]:text-muted-foreground data-[formula-empty]:no-underline data-[formula-empty]:decoration-transparent data-[formula-empty]:hover:decoration-transparent"
  ),
};

export function classNameForMarks(marks: readonly InlineMarkType[]): string {
  return cn(marks.map((mark) => inlineMarkClassNames[mark]));
}

interface RichTextContentProps {
  /**
   * Rendered value per inline formula token, keyed by the token's offset (see
   * `useInlineFormulaValues`). A token with no entry shows a placeholder rather
   * than its sentinel — the value simply has not been computed yet.
   */
  formulaValues?: ReadonlyMap<number, string>;
  marks?: InlineMark[];
  text: string;
}

/** Shown for a token whose value has not resolved yet. */
const PENDING_TOKEN_LABEL = "…";

/**
 * Read-only rich text: plain runs as bare text, marked runs as styled spans.
 * Plain link marks use {@link InlineLink} for hover OG previews; page-link marks
 * (`pageId`) use {@link InlinePageLink}. Newlines stay literal — parents render
 * with `whitespace-pre-wrap`.
 */
export function RichTextContent({
  formulaValues,
  marks,
  text,
}: RichTextContentProps) {
  if (!marks || marks.length === 0) {
    return text;
  }

  let offset = 0;
  return segmentRichText(text, marks).map((segment) => {
    const segmentStart = offset;
    const key = `${offset}:${segment.marks.join("-")}:${segment.pageId ?? ""}`;
    offset += segment.text.length;
    const className =
      segment.marks.length > 0 ? classNameForMarks(segment.marks) : undefined;
    if (segment.pageId) {
      const styleMarks = pageLinkTitleMarks(segment.marks);
      return (
        <InlinePageLink
          className={
            styleMarks.length > 0 ? classNameForMarks(styleMarks) : undefined
          }
          key={key}
          label={segment.text}
          pageId={segment.pageId}
        />
      );
    }
    if (segment.href) {
      return (
        <InlineLink className={className} href={segment.href} key={key}>
          {segment.text}
        </InlineLink>
      );
    }
    if (segment.expression !== undefined) {
      // The segment's own text is the sentinel; render the value in its place
      // so `props.text` never has to carry it.
      const value = formulaValues?.get(segmentStart);
      const isEmpty = value === EMPTY_INLINE_FORMULA_LABEL;
      return (
        <span
          className={className}
          data-formula-empty={isEmpty ? "" : undefined}
          data-inline-formula
          key={key}
          // Both lines matter on hover: the value may be truncated, and the
          // expression is the only thing explaining where it came from.
          title={
            value === undefined
              ? segment.expression
              : `${value}\n${segment.expression}`
          }
        >
          {value ?? PENDING_TOKEN_LABEL}
        </span>
      );
    }
    return (
      <span className={className} key={key}>
        {segment.text}
      </span>
    );
  });
}
