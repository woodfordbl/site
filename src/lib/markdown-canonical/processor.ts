import type { Root } from "mdast";
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown,
} from "mdast-util-gfm-strikethrough";
import { gfmTableFromMarkdown, gfmTableToMarkdown } from "mdast-util-gfm-table";
import {
  gfmTaskListItemFromMarkdown,
  gfmTaskListItemToMarkdown,
} from "mdast-util-gfm-task-list-item";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTaskListItem } from "micromark-extension-gfm-task-list-item";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import remarkStringify, {
  type Options as StringifyOptions,
} from "remark-stringify";
import { type Processor, unified } from "unified";

/**
 * The one unified pipeline behind the canonical codec. Escaping and printing
 * are remark's job — the converters only build/read mdast. Stringify options
 * pin the canonical surface so `serialize(parse(serialize(x)))` is
 * byte-identical.
 */

/**
 * The GFM subset the codec actually uses: strikethrough, tables, and task
 * lists. Deliberately NOT `remark-gfm`: its autolink-literal feature re-links
 * email/`www.` shaped prose via a text-node transform that runs AFTER escape
 * resolution, so no amount of serializer escaping survives a reparse — it
 * breaks `serialize(parse(serialize(x))) === serialize(x)` for any prose
 * containing an email-shaped substring. Explicit `<url>` autolinks are core
 * CommonMark and unaffected.
 */
function remarkGfmSubset(this: Processor): void {
  const data = this.data();
  data.micromarkExtensions ??= [];
  data.fromMarkdownExtensions ??= [];
  data.toMarkdownExtensions ??= [];
  data.micromarkExtensions.push(
    gfmStrikethrough(),
    gfmTable(),
    gfmTaskListItem()
  );
  data.fromMarkdownExtensions.push(
    gfmStrikethroughFromMarkdown(),
    gfmTableFromMarkdown(),
    gfmTaskListItemFromMarkdown()
  );
  data.toMarkdownExtensions.push(
    gfmStrikethroughToMarkdown(),
    gfmTableToMarkdown(),
    gfmTaskListItemToMarkdown()
  );
}

const CANONICAL_STRINGIFY_OPTIONS: StringifyOptions = {
  bullet: "-",
  emphasis: "*",
  fence: "`",
  fences: true,
  listItemIndent: "one",
  rule: "-",
  strong: "*",
};

let processor: Processor<Root, undefined, undefined, Root, string> | null =
  null;

export function getMarkdownProcessor(): Processor<
  Root,
  undefined,
  undefined,
  Root,
  string
> {
  if (!processor) {
    processor = unified()
      .use(remarkParse)
      .use(remarkGfmSubset)
      .use(remarkFrontmatter, ["yaml"])
      .use(remarkDirective)
      .use(remarkStringify, CANONICAL_STRINGIFY_OPTIONS);
  }
  return processor;
}

export function parseMarkdownToTree(raw: string): Root {
  return getMarkdownProcessor().parse(raw);
}

const HIGH_THEN_LOW_REF_RE = /([\uD800-\uDBFF])&#x(D[C-F][0-9A-F]{2});/gi;
const HIGH_REF_THEN_LOW_RE = /&#x(D[89AB][0-9A-F]{2});([\uDC00-\uDFFF])/gi;

/**
 * mdast-util-to-markdown classifies attention-adjacent characters by single
 * UTF-16 unit, so an emphasis delimiter next to an astral character gets half
 * the surrogate pair encoded as a (never otherwise legal) surrogate character
 * reference. Recombining the halves is always safe: the full code point
 * classifies as punctuation/symbol wherever the half did.
 */
function repairSplitSurrogateRefs(output: string): string {
  return output
    .replaceAll(HIGH_THEN_LOW_REF_RE, (_, high: string, hex: string) =>
      String.fromCharCode(high.charCodeAt(0), Number.parseInt(hex, 16))
    )
    .replaceAll(HIGH_REF_THEN_LOW_RE, (_, hex: string, low: string) =>
      String.fromCharCode(Number.parseInt(hex, 16), low.charCodeAt(0))
    );
}

export function stringifyTree(tree: Root): string {
  return repairSplitSurrogateRefs(getMarkdownProcessor().stringify(tree));
}
