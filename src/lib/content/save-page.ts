import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { createServerFn } from "@tanstack/react-start";

import { assertAuthorSaveAllowed } from "@/lib/content/author-save-guard.ts";
import { hashStableValue } from "@/lib/content/block-hash.ts";
import {
  contentPagesRoot,
  readPageFilesFromDisk,
} from "@/lib/content/content-pages-fs.server.ts";
import {
  markdownPathParentSlug,
  markdownPathToSlug,
  slugToIndexMarkdownPath,
  slugToLeafMarkdownPath,
} from "@/lib/content/page-path.ts";
import {
  pageToFrontmatter,
  parsePageFrontmatter,
} from "@/lib/markdown-canonical/frontmatter.ts";
import { serializePageMarkdown } from "@/lib/markdown-canonical/serialize-page.ts";
import { normalizePageSlug } from "@/lib/pages/slugify.ts";
import { type Page, pageSchema } from "@/lib/schemas/page.ts";

/**
 * Author save: serialize a page document to canonical markdown and write it
 * into `content/pages/` (dev-only; see `assertAuthorSaveAllowed`). Layout is
 * normalized on every write — a page with children becomes `slug/index.md`,
 * a leaf becomes `slug.md` — and any stale file carrying the same page id
 * (old slug, other layout variant) is removed. Writes are atomic
 * (tmp + rename).
 */

const FRONTMATTER_FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

interface DiskCatalogEntry {
  id: string;
  relativePath: string;
  slug: string;
  title: string;
}

async function readDiskCatalog(): Promise<DiskCatalogEntry[]> {
  const files = await readPageFilesFromDisk();
  const entries: DiskCatalogEntry[] = [];
  for (const file of files) {
    const match = FRONTMATTER_FENCE_RE.exec(file.raw);
    if (!match || match[1] === undefined) {
      continue;
    }
    try {
      const frontmatter = parsePageFrontmatter(match[1]);
      entries.push({
        id: frontmatter.id,
        relativePath: file.relativePath,
        slug: markdownPathToSlug(file.relativePath),
        title: frontmatter.title,
      });
    } catch {
      // Malformed frontmatter never blocks a save; the loader will complain.
    }
  }
  return entries;
}

function targetPathFor(page: Page, catalog: DiskCatalogEntry[]): string {
  const slug = normalizePageSlug(page.slug);
  const prefix = slug === "/" ? "/" : `${slug}/`;
  const hasChildren = catalog.some(
    (entry) => entry.id !== page.id && entry.slug.startsWith(prefix)
  );
  return slug === "/" || hasChildren
    ? slugToIndexMarkdownPath(slug)
    : slugToLeafMarkdownPath(slug);
}

/** Relative href from the saved file's directory to the target's file. */
function relativeHrefBetween(fromPath: string, toPath: string): string {
  const fromDir = dirname(fromPath);
  const href = relative(fromDir === "." ? "" : fromDir, toPath).replaceAll(
    "\\",
    "/"
  );
  return href.startsWith(".") ? href : `./${href}`;
}

export const savePage = createServerFn({ method: "POST" })
  .validator((data: unknown) => pageSchema.parse(data))
  .handler(async ({ data }) => {
    assertAuthorSaveAllowed();
    const root = contentPagesRoot();
    const catalog = await readDiskCatalog();
    const targetPath = targetPathFor(data, catalog);

    const byId = new Map(catalog.map((entry) => [entry.id, entry]));
    const parentSlug = markdownPathParentSlug(targetPath);
    const derivedParentId =
      parentSlug === null
        ? null
        : (catalog.find((entry) => entry.slug === parentSlug)?.id ?? null);
    const parentOverride =
      data.parentId !== null && data.parentId !== derivedParentId
        ? { parent: data.parentId }
        : {};

    const markdown = serializePageMarkdown(
      data.blocks,
      { ...pageToFrontmatter(data), ...parentOverride },
      {
        resolvePathByPageId: (pageId) => {
          const target = byId.get(pageId);
          if (!target || pageId === data.id) {
            return;
          }
          return relativeHrefBetween(targetPath, target.relativePath);
        },
        resolveLabelByPageId: (pageId) => byId.get(pageId)?.title,
      }
    );

    const filePath = join(root, targetPath);
    await mkdir(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}`;
    await writeFile(tempPath, markdown, "utf-8");
    await rename(tempPath, filePath);

    // Remove stale copies of this page (old slug or the other layout form).
    const stale = catalog.filter(
      (entry) => entry.id === data.id && entry.relativePath !== targetPath
    );
    await Promise.all(
      stale.map((entry) =>
        rm(join(root, entry.relativePath), { force: true }).catch(
          () => undefined
        )
      )
    );

    return {
      ok: true as const,
      path: filePath,
      /** Hash of the written bytes — the dev-disk echo-suppression token. */
      contentHash: hashStableValue(markdown),
    };
  });
