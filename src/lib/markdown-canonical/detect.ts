/**
 * Cheap, dependency-free heuristic for clipboard text: does this look like
 * block-level markdown worth parsing into blocks? Deliberately conservative —
 * plain prose pastes must keep their current behavior. Kept separate from the
 * codec so callers can gate the lazy remark chunk on it.
 */

const BLOCK_TOKEN_RE = /^(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|```|---\s*$|\|.*\|)/m;

export function looksLikeMarkdownBlocks(text: string): boolean {
  if (!text.includes("\n")) {
    return false;
  }
  return BLOCK_TOKEN_RE.test(text);
}
