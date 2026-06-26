import { appendPageActivityEvent } from "@/db/activity/page-activity-store.ts";
import {
  blockActivityLabel,
  type PageActivityEventType,
} from "@/lib/pages/page-activity-events.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { PageFont } from "@/lib/schemas/page-settings.ts";

const BLOCK_UPDATE_DEBOUNCE_MS = 30_000;

const blockUpdateCoalesce = new Map<
  string,
  { eventId: string; timeoutId: ReturnType<typeof setTimeout> }
>();

function coalesceKey(pageId: string, blockId: string): string {
  return `${pageId}:${blockId}`;
}

function queueActivityEvent(
  pageId: string,
  type: PageActivityEventType,
  summary: string,
  details?: { blockId?: string; blockType?: string }
): void {
  appendPageActivityEvent(pageId, {
    type,
    summary,
    timestamp: new Date().toISOString(),
    blockId: details?.blockId,
    blockType: details?.blockType,
  }).catch(() => undefined);
}

export function recordPageMetadataActivity(
  pageId: string,
  summary: string
): void {
  queueActivityEvent(pageId, "page.metadata.updated", summary);
}

export function recordPageSettingsActivity(
  pageId: string,
  summary: string
): void {
  queueActivityEvent(pageId, "page.settings.updated", summary);
}

export function recordPageRepositionActivity(pageId: string): void {
  queueActivityEvent(pageId, "page.repositioned", "Moved page");
}

export function recordPageCreatedActivity(
  pageId: string,
  duplicated: boolean
): void {
  queueActivityEvent(
    pageId,
    duplicated ? "page.duplicated" : "page.created",
    duplicated ? "Duplicated page" : "Created page"
  );
}

function fontSettingLabel(font: PageFont): string {
  if (font === "serif") {
    return "Serif";
  }
  if (font === "mono") {
    return "Mono";
  }
  return "Default";
}

export function recordFontSettingActivity(
  pageId: string,
  font: PageFont
): void {
  recordPageSettingsActivity(
    pageId,
    `Changed font to ${fontSettingLabel(font)}`
  );
}

export function recordSmallTextSettingActivity(
  pageId: string,
  enabled: boolean
): void {
  recordPageSettingsActivity(
    pageId,
    enabled ? "Turned on small text" : "Turned off small text"
  );
}

export function recordBlockInsertedActivity(
  pageId: string,
  block: Block
): void {
  queueActivityEvent(
    pageId,
    "block.inserted",
    `Added ${blockActivityLabel(block.type).toLowerCase()} block`,
    {
      blockId: block.id,
      blockType: block.type,
    }
  );
}

export function recordBlockDeletedActivity(
  pageId: string,
  blockId: string,
  blockType?: string
): void {
  const label = blockType
    ? blockActivityLabel(blockType).toLowerCase()
    : "block";
  queueActivityEvent(pageId, "block.deleted", `Removed ${label} block`, {
    blockId,
    blockType,
  });
}

/** Coalesces rapid `block.updated` events per block within 30s. */
export function recordBlockUpdatedActivity(pageId: string, block: Block): void {
  const key = coalesceKey(pageId, block.id);
  const existing = blockUpdateCoalesce.get(key);
  if (existing) {
    clearTimeout(existing.timeoutId);
  }

  const timeoutId = setTimeout(() => {
    blockUpdateCoalesce.delete(key);
    queueActivityEvent(
      pageId,
      "block.updated",
      `Edited ${blockActivityLabel(block.type).toLowerCase()} block`,
      { blockId: block.id, blockType: block.type }
    );
  }, BLOCK_UPDATE_DEBOUNCE_MS);

  blockUpdateCoalesce.set(key, {
    eventId: block.id,
    timeoutId,
  });
}

export function recordPageBlockDiffActivity(
  pageId: string,
  previousBlocks: Block[],
  nextBlocks: Block[]
): void {
  const previousById = new Map(
    previousBlocks.map((block) => [block.id, block])
  );
  const nextById = new Map(nextBlocks.map((block) => [block.id, block]));

  for (const block of nextBlocks) {
    const previous = previousById.get(block.id);
    if (!previous) {
      recordBlockInsertedActivity(pageId, block);
      continue;
    }
    if (JSON.stringify(previous) !== JSON.stringify(block)) {
      recordBlockUpdatedActivity(pageId, block);
    }
  }

  for (const block of previousBlocks) {
    if (!nextById.has(block.id)) {
      recordBlockDeletedActivity(pageId, block.id, block.type);
    }
  }

  const previousOrder = previousBlocks.map((block) => block.id).join(",");
  const nextOrder = nextBlocks.map((block) => block.id).join(",");
  if (
    previousOrder !== nextOrder &&
    previousBlocks.length === nextBlocks.length
  ) {
    queueActivityEvent(pageId, "block.reordered", "Reordered blocks");
  }
}
