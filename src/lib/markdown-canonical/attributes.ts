/**
 * Trailing attribute-brace codec — the ` {key=value flag}` suffix carrying
 * block props that have no markdown syntax home (colors, widths, toggle
 * markers). Emitted only when a block has non-default props to encode, so
 * plain content stays plain markdown.
 *
 * Disambiguation contract: parsing strips exactly ONE well-formed trailing
 * group from a block's assembled plain text. When user prose itself ends with
 * something that looks like a group (and the block has nothing to encode),
 * the serializer appends an empty ` {}` sentinel; stripping the sentinel
 * leaves the prose byte-exact.
 *
 * @see docs/proposals/markdown-native-content.md
 */

export type AttrValue = string | number | boolean | undefined;

/** Parsed attribute group: flags decode to `true`, pairs to strings. */
export type ParsedAttrs = Record<string, string | true>;

const BARE_VALUE_RE = /^[\w.,:%#/-]+$/;
const KEY_RE = /^[a-z][\w-]*$/i;
const TRAILING_GROUP_RE = /(?:^|\s)\{([^{}\n]*)\}$/;
const ATTR_TOKEN_RE = /([A-Za-z][\w-]*)(?:=("(?:[^"\\]|\\.)*"|[^\s"]+))?/g;
const TRAILING_SPACE_RE = /\s$/;

function encodeValue(value: string | number): string {
  const raw = String(value);
  if (raw.length > 0 && BARE_VALUE_RE.test(raw)) {
    return raw;
  }
  return `"${raw.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * Encode attrs in insertion order. `true` renders a bare flag; `false` and
 * `undefined` are omitted. Returns `""` when nothing survives.
 */
export function encodeAttrGroup(attrs: Record<string, AttrValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) {
      continue;
    }
    parts.push(value === true ? key : `${key}=${encodeValue(value)}`);
  }
  return parts.length > 0 ? `{${parts.join(" ")}}` : "";
}

function decodeValue(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  return raw;
}

/** Decode a group's inner text; null when a token is malformed. */
export function decodeAttrGroup(inner: string): ParsedAttrs | null {
  const attrs: ParsedAttrs = {};
  const trimmed = inner.trim();
  if (trimmed.length === 0) {
    return attrs;
  }
  let consumed = 0;
  for (const match of trimmed.matchAll(ATTR_TOKEN_RE)) {
    const [token, key, value] = match;
    if (match.index !== consumed || !(key && KEY_RE.test(key))) {
      return null;
    }
    attrs[key] = value === undefined ? true : decodeValue(value);
    consumed = match.index + token.length;
    while (trimmed[consumed] === " ") {
      consumed += 1;
    }
  }
  return consumed === trimmed.length ? attrs : null;
}

export interface SplitAttrsResult {
  attrs: ParsedAttrs;
  text: string;
}

/**
 * Strip exactly one well-formed trailing group from `text`. An empty group is
 * the no-op sentinel (attrs `{}`); no group leaves the text untouched.
 */
export function splitTrailingAttrGroup(text: string): SplitAttrsResult {
  const match = TRAILING_GROUP_RE.exec(text);
  if (!match || match[1] === undefined) {
    return { attrs: {}, text };
  }
  const attrs = decodeAttrGroup(match[1]);
  if (attrs === null) {
    return { attrs: {}, text };
  }
  const cut = text.slice(0, match.index).replace(TRAILING_SPACE_RE, "");
  const keptPrefix = text.slice(match.index, match.index + match[0].length);
  const groupStartsLine = match.index === 0 && !keptPrefix.startsWith(" ");
  return { attrs, text: groupStartsLine ? "" : cut };
}

/** True when the whole string is exactly one attribute group. */
export function isAttrGroupOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    return false;
  }
  if (trimmed.length < 2 || trimmed.slice(1, -1).includes("{")) {
    return false;
  }
  return decodeAttrGroup(trimmed.slice(1, -1)) !== null;
}

/**
 * True when serialized prose would mis-parse without the ` {}` sentinel —
 * i.e. the text already ends in something `splitTrailingAttrGroup` would eat.
 */
export function needsAttrSentinel(text: string): boolean {
  const { text: stripped } = splitTrailingAttrGroup(text);
  return stripped !== text;
}
