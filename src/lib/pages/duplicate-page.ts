import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";
import type { PageCommand } from "@/lib/canvas/commands.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import { resolveSourceBlocksForPage } from "@/lib/pages/resolve-source-page-blocks.ts";

/**
 * Dispatches a `page.create` that copies `page`. With `withContent`, the copy
 * carries the source blocks; without, it copies only the shell (settings, cover,
 * title, icon) and starts from an empty body.
 *
 * Reads local blocks lazily (non-reactively) so callers stay SSR-safe — a live
 * block query would abort server rendering.
 */
export function duplicatePage(options: {
  dispatch: (command: PageCommand) => void;
  page: PageSummary;
  withContent: boolean;
}): void {
  const { dispatch, page, withContent } = options;
  const localBlocks = readBootstrapPageBlocks(page.id).blocks;

  resolveSourceBlocksForPage(page, localBlocks)
    .then((source) => {
      dispatch({
        type: "page.create",
        title: `Copy of ${page.title}`,
        parentId: page.parentId,
        insertAfterPageId: page.id,
        initialBlocks: withContent ? clonePageBlocks(source.blocks) : undefined,
        icon: source.icon,
        headerImage: source.headerImage,
        font: source.font,
        fullWidth: source.fullWidth,
        textScale: source.textScale,
      });
    })
    .catch(() => undefined);
}
