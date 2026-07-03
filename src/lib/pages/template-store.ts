import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import {
  deleteAllBlocksForPage,
  seedPageBlocks,
} from "@/db/queries/block-collection-ops.ts";
import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";
import { clearPageSnapshots } from "@/db/snapshots/page-snapshot-store.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import {
  TEMPLATE_PAGE_ID,
  TEMPLATE_PAGE_SLUG,
  TEMPLATE_PAGE_TITLE,
} from "@/lib/pages/template-page.ts";
import type { Block } from "@/lib/schemas/block.ts";
import {
  isLocallyDeletedPage,
  localPageSchema,
} from "@/lib/schemas/local-page.ts";
import type { PageHeaderImage } from "@/lib/schemas/page-settings.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";

/** A full page snapshot the template stores and new pages clone from. */
export interface TemplateSnapshot {
  blocks: Block[];
  font?: "default" | "serif" | "mono";
  fullWidth?: boolean;
  headerImage?: PageHeaderImage;
  icon?: string;
  textScale?: "small" | "default" | "large";
}

function readTemplateRecord() {
  return (
    localPagesCollection.toArray.find(
      (page) => page.id === TEMPLATE_PAGE_ID && !isLocallyDeletedPage(page)
    ) ?? null
  );
}

/** True when a template snapshot record exists locally. */
export function templateExists(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return readTemplateRecord() != null;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Writes the template record's settings, inserting the record if absent. */
function upsertTemplateRecord(
  settings: Omit<TemplateSnapshot, "blocks">
): void {
  const now = nowIso();
  if (readTemplateRecord()) {
    localPagesCollection.update(TEMPLATE_PAGE_ID, (draft) => {
      draft.icon = settings.icon;
      draft.headerImage = settings.headerImage;
      draft.font = settings.font;
      draft.fullWidth = settings.fullWidth;
      draft.textScale = settings.textScale;
      draft.updatedAt = now;
    });
    return;
  }

  localPagesCollection.insert({
    id: TEMPLATE_PAGE_ID,
    slug: TEMPLATE_PAGE_SLUG,
    title: TEMPLATE_PAGE_TITLE,
    parentId: null,
    icon: settings.icon,
    headerImage: settings.headerImage,
    font: settings.font,
    fullWidth: settings.fullWidth,
    textScale: settings.textScale,
    serverBaselineHash: null,
    createdAt: now,
    updatedAt: now,
  });
}

/** Replaces the template's stored blocks with a fresh clone of `blocks`. */
function replaceTemplateBlocks(blocks: Block[]): void {
  deleteAllBlocksForPage(readBlockShardForPage(TEMPLATE_PAGE_ID));
  seedPageBlocks(TEMPLATE_PAGE_ID, clonePageBlocks(blocks));
}

/** Creates an empty template (single text block) ready to be designed. */
export function createEmptyTemplate(): void {
  upsertTemplateRecord({});
  replaceTemplateBlocks([createEmptyBlock("text")]);
}

/** Removes the template record, its blocks, and any captured snapshots. */
export function deleteTemplate(): void {
  deleteAllBlocksForPage(readBlockShardForPage(TEMPLATE_PAGE_ID));
  clearPageSnapshots(TEMPLATE_PAGE_ID).catch(() => undefined);
  markPageClean(TEMPLATE_PAGE_ID);
  if (readTemplateRecord()) {
    localPagesCollection.delete(TEMPLATE_PAGE_ID);
  }
}

/** Overwrites the template with a page snapshot (Save as Template). */
export function saveSnapshotAsTemplate(snapshot: TemplateSnapshot): void {
  const { blocks, ...settings } = snapshot;
  upsertTemplateRecord(settings);
  replaceTemplateBlocks(blocks);
}

/**
 * Builds a full snapshot of `page` — its blocks plus all display settings —
 * reading local edits when present and falling back to shipped content.
 */
export async function buildTemplateSnapshotFromPage(
  page: PageSummary
): Promise<TemplateSnapshot> {
  const localBlocks = readBootstrapPageBlocks(page.id).blocks;
  const localRecord = readLocalStorageCollection(
    LOCAL_PAGES_STORAGE_KEY,
    localPageSchema
  ).find((candidate) => candidate.id === page.id);

  if (localBlocks.length > 0 && localRecord) {
    return {
      blocks: localBlocks,
      icon: localRecord.icon ?? page.icon,
      headerImage: localRecord.headerImage,
      font: localRecord.font,
      fullWidth: localRecord.fullWidth,
      textScale: localRecord.textScale,
    };
  }

  const loaded = await loadPage({ data: { slug: page.slug } });
  return {
    blocks: localBlocks.length > 0 ? localBlocks : loaded.blocks,
    icon: localRecord?.icon ?? loaded.icon,
    headerImage: localRecord?.headerImage ?? loaded.headerImage,
    font: localRecord?.font ?? loaded.font,
    fullWidth: localRecord?.fullWidth ?? loaded.fullWidth,
    textScale: localRecord?.textScale ?? loaded.textScale,
  };
}

/** Reads the stored template snapshot for seeding a new page, or null. */
export function readTemplateSnapshotForCreate(): TemplateSnapshot | null {
  const record = readTemplateRecord();
  if (!record) {
    return null;
  }

  return {
    blocks: readBootstrapPageBlocks(TEMPLATE_PAGE_ID).blocks,
    icon: record.icon,
    headerImage: record.headerImage,
    font: record.font,
    fullWidth: record.fullWidth,
    textScale: record.textScale,
  };
}
