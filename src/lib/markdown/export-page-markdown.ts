/**
 * Single-page Markdown export: collect the effective page, serialize it, and
 * trigger a `.md` download. Complements the lossless `.zip` archive export.
 */
import { collectWorkspacePage } from "@/lib/content/collect-workspace-pages.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  type PageDirectoryEntry,
  pageToMarkdown,
} from "@/lib/markdown/page-to-markdown.ts";

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

function buildPageDirectory(
  pages: PageSummary[]
): Map<string, PageDirectoryEntry> {
  return new Map(
    pages.map((page) => [page.id, { title: page.title, slug: page.slug }])
  );
}

/**
 * Serializes the page to Markdown and downloads it. `pages` (when provided)
 * resolves `pageLink` blocks to real `[title](slug)` links.
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

  const markdown = pageToMarkdown(page, {
    pageDirectory: buildPageDirectory(pages),
  });
  const fileName = `${fileSafeSlug(page.slug)}.md`;
  downloadMarkdown(markdown, fileName);
  return { fileName };
}
