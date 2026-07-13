import type { Break, Html, InlineCode, PhrasingContent, Text } from "mdast";
import type { TextDirective } from "mdast-util-directive";

import {
  normalizeInlineMarks,
  segmentRichText,
} from "@/lib/blocks/rich-text.ts";
import type { InlineMark, InlineMarkType } from "@/lib/schemas/rich-text.ts";

import { encodeAttrGroup } from "./attributes.ts";
import { parseMarkdownToTree, stringifyTree } from "./processor.ts";

/**
 * Offset marks ↔ mdast phrasing. Serialization walks `segmentRichText`
 * segments and groups consecutive runs per mark so delimiters nest properly
 * (never `**a****b**`). Parsing walks phrasing with an active-mark stack and
 * rebuilds `[start, end)` ranges over the accumulated plain text.
 *
 * Wrapper order, outermost → innermost: link → strong → emphasis → delete →
 * underline (paired `<u>` html siblings) → inline code (a leaf — it can hold
 * no children, so it is always innermost). Newlines in block text map to
 * `break` nodes both ways.
 */

interface Segment {
  href?: string;
  marks: InlineMarkType[];
  text: string;
}

const WRAP_ORDER = ["link", "strong", "emphasis", "delete"] as const;

type WrapMark = (typeof WRAP_ORDER)[number];

const WRAP_TO_MARK: Record<WrapMark, InlineMarkType> = {
  link: "link",
  strong: "bold",
  emphasis: "italic",
  delete: "strikethrough",
};

function segmentRunKey(segment: Segment, mark: InlineMarkType): string | null {
  if (!segment.marks.includes(mark)) {
    return null;
  }
  return mark === "link" ? `link:${segment.href ?? ""}` : mark;
}

function textAndBreaks(value: string): PhrasingContent[] {
  const nodes: PhrasingContent[] = [];
  const lines = value.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) {
      nodes.push({ type: "break" } satisfies Break);
    }
    if (line.length > 0) {
      nodes.push({ type: "text", value: line } satisfies Text);
    }
  });
  return nodes;
}

function segmentLeaf(segment: Segment): PhrasingContent[] {
  if (segment.marks.includes("code")) {
    return [{ type: "inlineCode", value: segment.text } satisfies InlineCode];
  }
  return textAndBreaks(segment.text);
}

function wrapUnderline(children: PhrasingContent[]): PhrasingContent[] {
  return [
    { type: "html", value: "<u>" } satisfies Html,
    ...children,
    { type: "html", value: "</u>" } satisfies Html,
  ];
}

type Wrapper = "underline" | WrapMark;

const WRAPPER_PRIORITY: readonly Wrapper[] = [
  "link",
  "underline",
  "strong",
  "emphasis",
  "delete",
];

function wrapperMark(wrapper: Wrapper): InlineMarkType {
  return wrapper === "underline" ? "underline" : WRAP_TO_MARK[wrapper];
}

function runLength(run: Segment[], from: number, wrapper: Wrapper): number {
  const first = run[from];
  if (first === undefined) {
    return 0;
  }
  const key = segmentRunKey(first, wrapperMark(wrapper));
  if (key === null) {
    return 0;
  }
  let end = from + 1;
  while (end < run.length) {
    const next = run[end];
    if (
      next === undefined ||
      segmentRunKey(next, wrapperMark(wrapper)) !== key
    ) {
      break;
    }
    end += 1;
  }
  return end - from;
}

/**
 * Greedy longest-run-outermost nesting: at each position, the wrapper whose
 * mark extends over the most consecutive segments wraps first (WRAPPER_PRIORITY
 * breaks ties). Fixed-order nesting emits adjacent delimiter runs
 * (`***X****Y*`) that reparse ambiguously; longest-outermost shares one
 * wrapper across the overlap instead.
 */
function buildRun(
  run: Segment[],
  available: readonly Wrapper[]
): PhrasingContent[] {
  const nodes: PhrasingContent[] = [];
  let index = 0;
  while (index < run.length) {
    const segment = run[index];
    if (segment === undefined) {
      break;
    }
    let best: Wrapper | null = null;
    let bestLength = 0;
    for (const wrapper of available) {
      const length = runLength(run, index, wrapper);
      if (length > bestLength) {
        best = wrapper;
        bestLength = length;
      }
    }
    if (best === null) {
      nodes.push(...segmentLeaf(segment));
      index += 1;
      continue;
    }
    const inner = buildRun(
      run.slice(index, index + bestLength),
      available.filter((wrapper) => wrapper !== best)
    );
    if (best === "underline") {
      nodes.push(...wrapUnderline(inner));
    } else if (best === "link") {
      nodes.push({ type: "link", url: segment.href ?? "", children: inner });
    } else {
      nodes.push({ type: best, children: inner });
    }
    index += bestLength;
  }
  return nodes;
}

const EMPHASIS_MARKS: ReadonlySet<InlineMarkType> = new Set([
  "bold",
  "italic",
  "strikethrough",
]);

const WHITESPACE_RE = /\s/;
// ZWJ + variation selectors — the joiners that glue emoji sequences together.
const COMBINER_RE = /[‍︎️]/;

function isLowSurrogate(char: string | undefined): boolean {
  if (!char) {
    return false;
  }
  const code = char.charCodeAt(0);
  return code >= 0xdc_00 && code <= 0xdf_ff;
}

/** A bad edge splits a surrogate pair or lands before a joiner/selector. */
function isBadEdgeAt(text: string, offset: number): boolean {
  const char = text[offset];
  if (char === undefined) {
    return false;
  }
  return isLowSurrogate(char) || COMBINER_RE.test(char);
}

function isTrimmableAt(
  text: string,
  start: number,
  end: number
): {
  end: number;
  start: number;
} {
  let s = start;
  let e = end;
  let moved = true;
  while (moved && s < e) {
    moved = false;
    if (WHITESPACE_RE.test(text[s] ?? "") || isBadEdgeAt(text, s)) {
      s += 1;
      moved = true;
    }
    if (
      s < e &&
      (WHITESPACE_RE.test(text[e - 1] ?? "") || isBadEdgeAt(text, e))
    ) {
      e -= 1;
      moved = true;
    }
  }
  return { start: s, end: e };
}

const MAX_NORMALIZE_PASSES = 4;

const PUNCT_RE = /[\p{P}\p{S}]/u;

/** Full code point rendered at `offset` (stepping back off a low surrogate). */
function codePointAt(text: string, offset: number): string {
  let index = offset;
  if (isLowSurrogate(text[index]) && index > 0) {
    index -= 1;
  }
  const code = text.codePointAt(index);
  return code === undefined ? "" : String.fromCodePoint(code);
}

/**
 * CommonMark attention (flanking) viability for an emphasis span: an opener
 * followed by punctuation must be preceded by whitespace/punctuation, and a
 * closer preceded by punctuation must be followed by whitespace/punctuation.
 * Spans that cannot legally carry delimiters drop the mark (styling loss)
 * rather than serialize delimiters that degrade into literal text.
 */
function canCarryEmphasis(text: string, start: number, end: number): boolean {
  const first = codePointAt(text, start);
  const last = codePointAt(text, end - 1);
  const before = start > 0 ? codePointAt(text, start - 1) : "";
  const after = codePointAt(text, end);
  const openOk =
    !PUNCT_RE.test(first) ||
    before === "" ||
    WHITESPACE_RE.test(before) ||
    PUNCT_RE.test(before);
  const closeOk =
    !PUNCT_RE.test(last) ||
    after === "" ||
    WHITESPACE_RE.test(after) ||
    PUNCT_RE.test(after);
  return openOk && closeOk;
}

interface MarkPassResult {
  changed: boolean;
  marks: InlineMark[];
}

/**
 * Non-emphasis marks still snap inward off partial graphemes — a segment
 * boundary inside a surrogate pair splits the pair into unencodable halves
 * regardless of the mark's syntax.
 */
function snapMarkToGraphemes(text: string, mark: InlineMark): MarkPassResult {
  let { start, end } = mark;
  while (start < end && isBadEdgeAt(text, start)) {
    start += 1;
  }
  while (end > start && isBadEdgeAt(text, end)) {
    end -= 1;
  }
  const changed = start !== mark.start || end !== mark.end;
  return { changed, marks: start < end ? [{ ...mark, start, end }] : [] };
}

/** One emphasis mark contracted to viable per-segment spans. */
function emphasisSpans(
  text: string,
  mark: InlineMark,
  boundaries: readonly number[]
): MarkPassResult {
  const marks: InlineMark[] = [];
  let changed = false;
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const segStart = Math.max(boundaries[i] ?? 0, mark.start);
    const segEnd = Math.min(boundaries[i + 1] ?? 0, mark.end);
    if (segStart >= segEnd) {
      continue;
    }
    const trimmed = isTrimmableAt(text, segStart, segEnd);
    if (trimmed.start !== segStart || trimmed.end !== segEnd) {
      changed = true;
    }
    if (trimmed.start >= trimmed.end) {
      continue;
    }
    if (!canCarryEmphasis(text, trimmed.start, trimmed.end)) {
      changed = true;
      continue;
    }
    marks.push({ ...mark, start: trimmed.start, end: trimmed.end });
  }
  return { changed, marks };
}

/**
 * Emphasis delimiters cannot flank whitespace (`** rocket **` is not strong)
 * or split a surrogate pair / emoji joiner sequence. Delimiters open and
 * close at SEGMENT boundaries (where any mark starts or ends), so
 * bold/italic/strikethrough coverage contracts to the trimmed span of each
 * segment it covers, iterated to a fixpoint. Styling on boundary whitespace
 * or a partial grapheme is invisible; this is part of the codec's normal
 * form, applied identically on serialize and on comparison.
 */
export function normalizeEmphasisForMarkdown(
  text: string,
  marks: readonly InlineMark[] | undefined
): InlineMark[] {
  let current = normalizeInlineMarks(marks ?? [], text.length);
  for (let pass = 0; pass < MAX_NORMALIZE_PASSES; pass += 1) {
    const boundaries = new Set<number>([0, text.length]);
    for (const mark of current) {
      boundaries.add(mark.start);
      boundaries.add(mark.end);
    }
    const sorted = [...boundaries].sort((a, b) => a - b);

    const next: InlineMark[] = [];
    let changed = false;
    for (const mark of current) {
      const result = EMPHASIS_MARKS.has(mark.type)
        ? emphasisSpans(text, mark, sorted)
        : snapMarkToGraphemes(text, mark);
      changed = changed || result.changed;
      next.push(...result.marks);
    }
    current = normalizeInlineMarks(next, text.length);
    if (!changed) {
      break;
    }
  }
  return current;
}

function buildPhrasingRaw(
  text: string,
  marks: readonly InlineMark[]
): PhrasingContent[] {
  const segments = segmentRichText(text, marks) as Segment[];
  return buildRun(segments, WRAPPER_PRIORITY);
}

function markKey(mark: InlineMark): string {
  return `${mark.type}:${mark.start}:${mark.end}:${mark.href ?? ""}`;
}

function sameMarks(
  a: readonly InlineMark[],
  b: readonly InlineMark[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const keys = new Set(a.map(markKey));
  return b.every((mark) => keys.has(markKey(mark)));
}

const MAX_VERIFY_ATTEMPTS = 6;

/** Serialize a candidate phrasing in isolation and reparse it. */
function reparsePhrasing(phrasing: PhrasingContent[]): ParsedRichText | null {
  const markdown = stringifyTree({
    type: "root",
    children: [{ type: "paragraph", children: phrasing }],
  });
  const first = parseMarkdownToTree(markdown).children[0];
  if (first?.type !== "paragraph") {
    return null;
  }
  return phrasingToMarks(first.children);
}

/**
 * The definitive mark normal form: marks must SURVIVE serialization. After
 * the static pass (whitespace/grapheme/flanking heuristics), the candidate
 * phrasing is stringified in isolation and reparsed with the real parser;
 * marks that come back changed are dropped and the check reruns. CommonMark
 * attention has more corner cases (surrogate-half classification, delimiter
 * adjacency, GFM strikethrough strictness) than any static model catches —
 * verification by construction is exact, and it runs on flush/export paths,
 * never per keystroke.
 */
export function normalizeMarksForSerialization(
  text: string,
  marks: readonly InlineMark[] | undefined
): InlineMark[] {
  let current = normalizeEmphasisForMarkdown(text, marks);
  for (let attempt = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt += 1) {
    if (current.length === 0) {
      return current;
    }
    const reparsed = reparsePhrasing(buildPhrasingRaw(text, current));
    if (
      reparsed !== null &&
      reparsed.text === text &&
      sameMarks(reparsed.marks, current)
    ) {
      return current;
    }
    if (reparsed !== null && reparsed.text === text) {
      const survivorKeys = new Set(reparsed.marks.map(markKey));
      const surviving = current.filter((mark) =>
        survivorKeys.has(markKey(mark))
      );
      if (surviving.length < current.length) {
        current = normalizeInlineMarks(surviving, text.length);
        continue;
      }
    }
    // Text corrupted or no identifiable survivor set: peel emphasis first
    // (the flanking-sensitive family), then everything.
    const withoutEmphasis = current.filter(
      (mark) => !EMPHASIS_MARKS.has(mark.type)
    );
    current =
      withoutEmphasis.length < current.length
        ? normalizeInlineMarks(withoutEmphasis, text.length)
        : [];
  }
  return current;
}

/** Build phrasing for a block's primary text + marks. */
export function marksToPhrasing(
  text: string,
  marks: readonly InlineMark[] | undefined
): PhrasingContent[] {
  return buildPhrasingRaw(text, normalizeMarksForSerialization(text, marks));
}

export interface ParsedRichText {
  marks: InlineMark[];
  text: string;
}

interface WalkState {
  marks: InlineMark[];
  text: string;
  underlineStarts: number[];
}

interface ActiveMarks {
  href?: string;
  types: readonly InlineMarkType[];
}

function pushMarks(state: WalkState, active: ActiveMarks, start: number): void {
  for (const type of active.types) {
    state.marks.push({
      type,
      start,
      end: state.text.length,
      ...(type === "link" && active.href !== undefined
        ? { href: active.href }
        : {}),
    });
  }
}

const U_OPEN_RE = /^<u\s*>$/i;
const U_CLOSE_RE = /^<\/u\s*>$/i;

function walkPhrasing(
  nodes: readonly PhrasingContent[],
  active: ActiveMarks,
  state: WalkState
): void {
  for (const node of nodes) {
    walkNode(node, active, state);
  }
}

function walkNode(
  node: PhrasingContent,
  active: ActiveMarks,
  state: WalkState
): void {
  switch (node.type) {
    case "text": {
      const start = state.text.length;
      state.text += node.value;
      pushMarks(state, active, start);
      return;
    }
    case "break": {
      const start = state.text.length;
      state.text += "\n";
      pushMarks(state, active, start);
      return;
    }
    case "inlineCode": {
      const start = state.text.length;
      state.text += node.value;
      pushMarks(state, { ...active, types: [...active.types, "code"] }, start);
      return;
    }
    case "strong":
    case "emphasis":
    case "delete": {
      const type = WRAP_TO_MARK[node.type];
      walkPhrasing(
        node.children,
        { ...active, types: [...active.types, type] },
        state
      );
      return;
    }
    case "link": {
      walkPhrasing(
        node.children,
        { href: node.url, types: [...active.types, "link"] },
        state
      );
      return;
    }
    case "html": {
      walkHtml(node, active, state);
      return;
    }
    case "textDirective": {
      // The serializer never emits inline directives, so any textDirective
      // came from literal prose (`:name` sequences the directive tokenizer
      // ate greedily). Reconstruct the source text.
      const raw = reconstructTextDirective(node as TextDirective);
      const start = state.text.length;
      state.text += raw;
      pushMarks(state, active, start);
      return;
    }
    default: {
      const raw = toPlainText(node);
      if (raw.length > 0) {
        const start = state.text.length;
        state.text += raw;
        pushMarks(state, active, start);
      }
    }
  }
}

function walkHtml(node: Html, active: ActiveMarks, state: WalkState): void {
  if (U_OPEN_RE.test(node.value)) {
    state.underlineStarts.push(state.text.length);
    return;
  }
  if (U_CLOSE_RE.test(node.value)) {
    const start = state.underlineStarts.pop();
    if (start !== undefined && start < state.text.length) {
      state.marks.push({ type: "underline", start, end: state.text.length });
    }
    return;
  }
  // Foreign inline HTML degrades to literal text.
  const start = state.text.length;
  state.text += node.value;
  pushMarks(state, active, start);
}

/** `:name[label]{attrs}` back to literal text (attr formatting canonicalized). */
export function reconstructTextDirective(node: TextDirective): string {
  const label =
    node.children.length > 0
      ? `[${node.children.map(toPlainText).join("")}]`
      : "";
  const attrs: Record<string, string | true> = {};
  for (const [key, value] of Object.entries(node.attributes ?? {})) {
    if (value !== undefined) {
      // Bare `{key}` parses as empty string; keep the flag form.
      attrs[key] = value === null || value === "" ? true : value;
    }
  }
  return `:${node.name}${label}${encodeAttrGroup(attrs)}`;
}

function toPlainText(node: PhrasingContent): string {
  if ("value" in node && typeof node.value === "string") {
    return node.value;
  }
  if ("children" in node && Array.isArray(node.children)) {
    return (node.children as PhrasingContent[]).map(toPlainText).join("");
  }
  return "";
}

/** Rebuild `{text, marks}` from phrasing (marks normalized). */
export function phrasingToMarks(
  nodes: readonly PhrasingContent[]
): ParsedRichText {
  const state: WalkState = { marks: [], text: "", underlineStarts: [] };
  walkPhrasing(nodes, { types: [] }, state);
  return {
    marks: normalizeInlineMarks(state.marks, state.text.length),
    text: state.text,
  };
}

/** Plain text of phrasing with `break` → newline (attrs/ambiguity checks). */
export function phrasingPlainText(nodes: readonly PhrasingContent[]): string {
  return phrasingToMarks(nodes).text;
}
