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
 * Returns an action that imports a Markdown `File` as a new page. The first H1
 * (or, failing that, the filename) becomes the title; a leading emoji on that
 * H1 becomes the page icon. `page.create` auto-navigates to the new page.
 */
export function useImportMarkdownPage() {
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);

  return useCallback(
    async (file: File): Promise<void> => {
      const [markdown, codec] = await Promise.all([
        file.text(),
        loadMarkdownCodec(),
      ]);
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
    },
    [dispatch]
  );
}
