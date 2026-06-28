import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadAllPages } from "@/lib/content/load-all-pages.ts";
import {
  prefersLocalBlockSource,
  type ResolvedPageState,
  resolvePageCatalog,
} from "@/lib/pages/resolve-page-state.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";
import type { PageSettings } from "@/lib/schemas/page-settings.ts";

export interface WorkspacePageCollection {
  /** Content-addressed ids of every `source: "asset"` reference across all pages. */
  assetIds: string[];
  pages: Page[];
}

function toSummary(page: Page): PageSummary {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    parentId: page.parentId,
    sidebarOrder: page.sidebarOrder,
    icon: page.icon,
  };
}

function pickSettings(source: LocalPage | Page | null): PageSettings {
  if (!source) {
    return {};
  }
  return {
    ...(source.font === undefined ? {} : { font: source.font }),
    ...(source.fullWidth === undefined ? {} : { fullWidth: source.fullWidth }),
    ...(source.headerImage === undefined
      ? {}
      : { headerImage: source.headerImage }),
    ...(source.textScale === undefined ? {} : { textScale: source.textScale }),
  };
}

function collectBlockAssetIds(blocks: Block[], into: Set<string>): void {
  for (const block of blocks) {
    if (
      block.type === "media" &&
      block.props.source === "asset" &&
      block.props.src
    ) {
      into.add(block.props.src);
    }
  }
}

/** Builds the effective page for one catalog entry, or null when it shouldn't ship. */
function buildEffectivePage(
  resolved: ResolvedPageState
): { assetIds: string[]; page: Page } | null {
  if (resolved.origin === "tombstoned" || resolved.origin === "orphaned") {
    return null;
  }

  const { summary, localPage, serverPage, origin } = resolved;

  const blocks = prefersLocalBlockSource(origin)
    ? readBootstrapPageBlocks(summary.id).blocks
    : (serverPage?.blocks ?? []);

  const settings = pickSettings(
    prefersLocalBlockSource(origin) ? localPage : serverPage
  );

  const assetIds = new Set<string>();
  if (settings.headerImage?.source === "asset" && settings.headerImage.src) {
    assetIds.add(settings.headerImage.src);
  }
  collectBlockAssetIds(blocks, assetIds);

  return {
    assetIds: [...assetIds],
    page: {
      id: summary.id,
      slug: summary.slug,
      title: summary.title,
      parentId: summary.parentId,
      ...(summary.icon === undefined ? {} : { icon: summary.icon }),
      ...(summary.sidebarOrder === undefined
        ? {}
        : { sidebarOrder: summary.sidebarOrder }),
      ...settings,
      blocks,
    },
  };
}

async function resolveWorkspaceCatalog(): Promise<ResolvedPageState[]> {
  const shipped = await loadAllPages();
  const serverPagesById = new Map(shipped.map((page) => [page.id, page]));
  const serverSummaries = shipped.map(toSummary);
  return resolvePageCatalog(
    serverSummaries,
    localPagesCollection.toArray,
    serverPagesById
  );
}

/**
 * Builds the effective merged view of every page (shipped overlaid with local
 * edits, tombstones dropped) plus the set of local media assets they reference.
 * This is the source of truth for a full workspace snapshot export.
 */
export async function collectWorkspacePages(): Promise<WorkspacePageCollection> {
  const catalog = await resolveWorkspaceCatalog();

  const pages: Page[] = [];
  const assetIds = new Set<string>();

  for (const resolved of catalog) {
    const built = buildEffectivePage(resolved);
    if (!built) {
      continue;
    }
    pages.push(built.page);
    for (const id of built.assetIds) {
      assetIds.add(id);
    }
  }

  return { assetIds: [...assetIds], pages };
}

/** Effective single page plus its referenced assets, for a per-page export. */
export async function collectWorkspacePage(
  pageId: string
): Promise<WorkspacePageCollection> {
  const catalog = await resolveWorkspaceCatalog();
  const resolved = catalog.find((entry) => entry.summary.id === pageId);
  if (!resolved) {
    throw new Error("This page could not be found.");
  }

  const built = buildEffectivePage(resolved);
  if (!built) {
    throw new Error("This page can't be exported.");
  }

  return { assetIds: built.assetIds, pages: [built.page] };
}
