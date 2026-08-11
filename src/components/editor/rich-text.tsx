import { InlinePageLink } from "@/components/editor/inline-page-link.tsx";
import { InlineLink } from "@/components/editor/link-preview.tsx";
import { segmentRichText } from "@/lib/blocks/rich-text.ts";
import { pageLinkTitleMarks } from "@/lib/editor/rich-text-dom.ts";
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
   */
  formula:
    "inline-formula-token code-no-ligatures rounded bg-muted px-1 py-px font-mono text-[0.85em] text-[color:var(--code-foreground,inherit)]",
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
      return (
        <span
          className={className}
          data-inline-formula
          key={key}
          title={segment.expression}
        >
          {formulaValues?.get(segmentStart) ?? PENDING_TOKEN_LABEL}
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
