import {
  markdownPathParentSlug,
  markdownPathToSlug,
} from "@/lib/content/page-path.ts";
import {
  type PageFrontmatter,
  parsePageFrontmatter,
} from "@/lib/markdown-canonical/frontmatter.ts";
import { parsePageMarkdown } from "@/lib/markdown-canonical/parse-page.ts";
import { type Page, pageSchema } from "@/lib/schemas/page.ts";

/**
 * Two-pass assembly of `content/pages/**∕*.md` into runtime `Page` objects.
 * Pass 1 reads only frontmatter to build the path/slug/id maps (page links
 * resolve against them); pass 2 parses bodies with that resolution in scope.
 * `slug` derives from the file path and `parentId` from the containing
 * folder (frontmatter `parent` overrides). Shared by the build-time glob
 * store and the dev filesystem reader.
 */

export interface RawPageFile {
  raw: string;
  /** Path relative to `content/pages/` (e.g. `previous-work/altitude.md`). */
  relativePath: string;
}

const FRONTMATTER_FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const QUERY_OR_FRAGMENT_RE = /[?#]/;
const MD_EXTENSION_RE = /\.md$/u;

interface PageFileEntry {
  file: RawPageFile;
  frontmatter: PageFrontmatter;
  slug: string;
}

function readFrontmatterOnly(file: RawPageFile): PageFrontmatter {
  const match = FRONTMATTER_FENCE_RE.exec(file.raw);
  if (!match || match[1] === undefined) {
    throw new Error(
      `content/pages/${file.relativePath} is missing its frontmatter fence`
    );
  }
  return parsePageFrontmatter(match[1]);
}

/** `./sibling.md` / `../up.md` resolved against the referencing file's dir. */
function resolveRelativeHref(fromPath: string, href: string): string | null {
  const cleaned = href.split(QUERY_OR_FRAGMENT_RE)[0] ?? "";
  if (!cleaned.endsWith(".md")) {
    return null;
  }
  const baseSegments = fromPath.split("/").slice(0, -1);
  const segments = [...baseSegments];
  for (const part of cleaned.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.join("/");
}

function dedupeLayoutVariants(entries: PageFileEntry[]): PageFileEntry[] {
  const bySlug = new Map<string, PageFileEntry>();
  for (const entry of entries) {
    const existing = bySlug.get(entry.slug);
    if (!existing) {
      bySlug.set(entry.slug, entry);
      continue;
    }
    // Both `a/b.md` and `a/b/index.md` exist — the folder form wins.
    const entryIsIndex = entry.file.relativePath.endsWith("index.md");
    if (entryIsIndex) {
      bySlug.set(entry.slug, entry);
    }
    console.warn(
      `content/pages: duplicate layout variants for slug ${entry.slug} — using ${bySlug.get(entry.slug)?.file.relativePath}`
    );
  }
  return [...bySlug.values()];
}

export function assembleMarkdownPages(files: RawPageFile[]): Page[] {
  const entries = dedupeLayoutVariants(
    files.map((file) => ({
      file,
      frontmatter: readFrontmatterOnly(file),
      slug: markdownPathToSlug(file.relativePath),
    }))
  );

  const idByPath = new Map<string, string>();
  const idBySlug = new Map<string, string>();
  for (const entry of entries) {
    idByPath.set(entry.file.relativePath, entry.frontmatter.id);
    idBySlug.set(entry.slug, entry.frontmatter.id);
  }

  return entries.map((entry) => {
    const { frontmatter, file, slug } = entry;
    const parsed = parsePageMarkdown(file.raw, {
      pageId: frontmatter.id,
      linkContext: {
        resolvePageIdByPath: (href) => {
          const resolved = resolveRelativeHref(file.relativePath, href);
          if (resolved === null) {
            return;
          }
          return (
            idByPath.get(resolved) ??
            idByPath.get(resolved.replace(MD_EXTENSION_RE, "/index.md"))
          );
        },
      },
    });

    const parentSlug = markdownPathParentSlug(file.relativePath);
    const derivedParentId =
      parentSlug === null ? null : (idBySlug.get(parentSlug) ?? null);

    return pageSchema.parse({
      id: frontmatter.id,
      slug,
      title: frontmatter.title,
      ...(frontmatter.icon === undefined ? {} : { icon: frontmatter.icon }),
      parentId: frontmatter.parent ?? derivedParentId,
      ...(frontmatter.order === undefined
        ? {}
        : { sidebarOrder: frontmatter.order }),
      blocks: parsed.blocks,
      ...(frontmatter.font === undefined ? {} : { font: frontmatter.font }),
      ...(frontmatter.textScale === undefined
        ? {}
        : { textScale: frontmatter.textScale }),
      ...(frontmatter.fullWidth === undefined
        ? {}
        : { fullWidth: frontmatter.fullWidth }),
      ...(frontmatter.cover === undefined
        ? {}
        : { headerImage: frontmatter.cover }),
    });
  });
}
