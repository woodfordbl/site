import type { Root } from "mdast";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
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
      .use(remarkGfm)
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
