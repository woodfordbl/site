import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { localPageSchema } from "@/lib/schemas/local-page.ts";
import type {
  PageFont,
  PageHeaderImage,
  PageTextScale,
} from "@/lib/schemas/page-settings.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";

export interface SourcePageContent {
  blocks: Block[];
  /** Body font carried onto the duplicate. */
  font?: PageFont;
  /** Full-width layout carried onto the duplicate. */
  fullWidth?: boolean;
  /** Cover ("header") image to carry onto the duplicate. */
  headerImage?: PageHeaderImage;
  /** Emoji or `tabler:IconName` to carry onto the duplicate. */
  icon?: string;
  /** Text size carried onto the duplicate. */
  textScale?: PageTextScale;
}

/**
 * Resolves what a duplicate should copy — blocks, cover image, icon, and
 * settings. Locally-edited pages read everything from the local page
 * document/shard; a pristine shipped page reads from its shipped JSON.
 */
export function resolveSourceBlocksForPage(
  page: PageSummary,
  localBlocks: Block[]
): Promise<SourcePageContent> {
  if (localBlocks.length > 0) {
    const localPage = readLocalStorageCollection(
      LOCAL_PAGES_STORAGE_KEY,
      localPageSchema
    ).find((candidate) => candidate.id === page.id);

    return Promise.resolve({
      blocks: localBlocks,
      icon: localPage?.icon ?? page.icon,
      headerImage: localPage?.headerImage,
      font: localPage?.font,
      fullWidth: localPage?.fullWidth,
      textScale: localPage?.textScale,
    });
  }

  return loadPage({ data: { slug: page.slug } }).then((loaded) => ({
    blocks: loaded.blocks,
    icon: loaded.icon,
    headerImage: loaded.headerImage,
    font: loaded.font,
    fullWidth: loaded.fullWidth,
    textScale: loaded.textScale,
  }));
}
