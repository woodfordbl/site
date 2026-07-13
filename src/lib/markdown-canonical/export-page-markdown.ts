/**
 * Single-page Markdown export: collect the effective page, serialize it with
 * the canonical codec, and trigger a `.md` download. Complements the lossless
 * `.zip` archive export. `pageLink` blocks export as `[title](slug)` links so
 * the file reads well outside the workspace.
 */
import { collectWorkspacePage } from "@/lib/content/collect-workspace-pages.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";

import { pageToFrontmatter } from "./frontmatter.ts";
import { loadMarkdownCodec } from "./loader.ts";

export interface MarkdownExportResult {
  fileName: string;
}

/** Turns a page slug into a filename-safe stem (slugs can contain `/`). */
function fileSafeSlug(slug: string): string {
  const stem = slug.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return stem.toLowerCase() || "page";
}

function downloadMarkdown(markdown: string, fileName: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Serializes the page to canonical Markdown and downloads it. `pages` (when
 * provided) resolves `pageLink` blocks to real `[title](slug)` links.
 */
export async function exportPageMarkdown(
  pageId: string,
  pages: PageSummary[] = []
): Promise<MarkdownExportResult> {
  const collection = await collectWorkspacePage(pageId);
  const page = collection.pages[0];
  if (!page) {
    throw new Error("This page can't be exported.");
  }

  const byId = new Map(pages.map((summary) => [summary.id, summary]));
  const codec = await loadMarkdownCodec();
  const markdown = codec.serializePageMarkdown(
    page.blocks,
    pageToFrontmatter(page),
    {
      resolvePathByPageId: (id) => byId.get(id)?.slug,
      resolveLabelByPageId: (id) => byId.get(id)?.title,
    }
  );
  const fileName = `${fileSafeSlug(page.slug)}.md`;
  downloadMarkdown(markdown, fileName);
  return { fileName };
}
