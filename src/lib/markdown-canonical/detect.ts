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

const MARKDOWN_FILE_RE = /\.(md|markdown|mdown|txt)$/i;

/** True when a native drag carries OS files (not an internal block/page drag). */
export function dragHasFiles(
  types: readonly string[] | DOMStringList
): boolean {
  return Array.from(types).includes("Files");
}

/** The markdown-importable files from a drop, in drop order. */
export function extractMarkdownFiles(
  files: FileList | readonly File[] | null
): File[] {
  if (!files) {
    return [];
  }
  return Array.from(files).filter((file) => MARKDOWN_FILE_RE.test(file.name));
}
