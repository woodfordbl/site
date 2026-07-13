import { normalizePageSlug, parsePagePath } from "@/lib/pages/slugify.ts";

/**
 * Slug ↔ markdown file path mapping for `content/pages/`. A page with
 * children is a folder with `index.md`; a leaf page is `{segment}.md`; home
 * (`/`) is the root `index.md`. The loader accepts BOTH layout variants for
 * the same slug (`a/b.md` and `a/b/index.md` — `index.md` wins on collision);
 * the writer normalizes to the variant matching whether children exist.
 */

const MD_EXTENSION_RE = /\.md$/u;
const INDEX_SUFFIX_RE = /(?:^|\/)index$/u;

function assertSafeSegments(segments: string[]): void {
  for (const segment of segments) {
    if (segment === ".." || segment === ".") {
      throw new Error("Invalid slug");
    }
  }
}

/** Leaf-form path for a slug (e.g. `/a/b` → `a/b.md`; `/` → `index.md`). */
export function slugToLeafMarkdownPath(slug: string): string {
  const normalized = normalizePageSlug(slug);
  if (normalized === "/") {
    return "index.md";
  }
  const segments = parsePagePath(normalized);
  assertSafeSegments(segments);
  return `${segments.join("/")}.md`;
}

/** Folder-form path for a slug (e.g. `/a/b` → `a/b/index.md`; `/` → `index.md`). */
export function slugToIndexMarkdownPath(slug: string): string {
  const normalized = normalizePageSlug(slug);
  if (normalized === "/") {
    return "index.md";
  }
  const segments = parsePagePath(normalized);
  assertSafeSegments(segments);
  return `${segments.join("/")}/index.md`;
}

/** Slug for a markdown path (`index.md` → `/`; `a/index.md` and `a.md` → `/a`). */
export function markdownPathToSlug(relativePath: string): string {
  const withoutExtension = relativePath.replace(MD_EXTENSION_RE, "");
  const withoutIndex = withoutExtension.replace(INDEX_SUFFIX_RE, "");
  if (withoutIndex.length === 0) {
    return "/";
  }
  return `/${withoutIndex}`;
}

/** The containing folder's slug — the path-derived parent scope. */
export function markdownPathParentSlug(relativePath: string): string | null {
  const slug = markdownPathToSlug(relativePath);
  if (slug === "/") {
    return null;
  }
  const segments = parsePagePath(slug);
  if (segments.length <= 1) {
    return null;
  }
  return `/${segments.slice(0, -1).join("/")}`;
}
