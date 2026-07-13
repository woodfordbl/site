import { useCallback } from "react";

import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { loadMarkdownCodec } from "@/lib/markdown-canonical/loader.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";

const FILE_EXTENSION_RE = /\.(md|markdown|mdown|txt)$/i;
const WORD_SEPARATOR_RE = /[-_]+/g;

/** Derives a fallback page title from a `.md` filename. */
function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(FILE_EXTENSION_RE, "");
  const cleaned = stem.replace(WORD_SEPARATOR_RE, " ").trim();
  return cleaned || DEFAULT_PAGE_TITLE;
}

/**
 * Returns an action that imports Markdown `File`s as new pages (used by the
 * header-menu file input and the sidebar drag-drop). Frontmatter title/icon
 * win; otherwise the first H1 (or the filename) becomes the title and a
 * leading emoji on that H1 the icon. `page.create` auto-navigates per page.
 */
export function useImportMarkdownPage() {
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);

  return useCallback(
    async (files: File | readonly File[]): Promise<void> => {
      const list = Array.isArray(files) ? files : [files as File];
      const codec = await loadMarkdownCodec();
      // Sequential so multi-file drops create pages in drop order; page.create
      // navigates on each insert, landing on the last imported page.
      for (const file of list) {
        const markdown = await file.text();
        const parsed = codec.parsePageMarkdown(markdown, { lenient: true });
        const title =
          parsed.frontmatter?.title.trim() ||
          parsed.title?.trim() ||
          titleFromFileName(file.name);
        const icon = parsed.frontmatter?.icon ?? parsed.icon;

        dispatch({
          type: "page.create",
          title,
          initialBlocks: parsed.blocks,
          ...(icon ? { icon } : {}),
        });
      }
    },
    [dispatch]
  );
}
