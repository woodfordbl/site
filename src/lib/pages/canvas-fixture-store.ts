import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import {
  deleteAllBlocksForPage,
  seedPageBlocks,
} from "@/db/queries/block-collection-ops.ts";
import {
  CANVAS_FIXTURE_PAGE_ID,
  CANVAS_FIXTURE_PAGE_SLUG,
  CANVAS_FIXTURE_PAGE_TITLE,
} from "@/lib/pages/canvas-fixture-page.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";
import { isLocallyDeletedPage } from "@/lib/schemas/local-page.ts";

function block(
  type: BlockType,
  props: Record<string, unknown>,
  parentId?: string
): Block {
  return {
    id: crypto.randomUUID(),
    type,
    props,
    ...(parentId ? { parentId } : {}),
  } as Block;
}

function text(content: string, parentId?: string): Block {
  return block("text", { text: content }, parentId);
}

/**
 * One block of every container permutation the pointer features care about:
 * plain rows, a callout with children, two columns, expanded and collapsed
 * toggles, tabs with two panels, a nested callout-in-column, a list, and a
 * checklist. Ids are fresh per seed; array order is document order.
 */
function buildFixtureBlocks(): Block[] {
  const blocks: Block[] = [];
  const push = (b: Block): Block => {
    blocks.push(b);
    return b;
  };

  push(block("heading", { level: 2, text: "Canvas fixture" }));
  push(text("Plain paragraph above the containers."));
  push(text("Second paragraph — marquee across these two."));

  const callout = push(block("callout", { icon: "💡" }));
  push(text("Callout child one.", callout.id));
  push(text("Callout child two.", callout.id));

  const columns = push(block("columns", {}));
  const columnA = push(block("column", { width: 1 }, columns.id));
  push(text("Column A · first.", columnA.id));
  push(text("Column A · second.", columnA.id));
  const columnB = push(block("column", { width: 1 }, columns.id));
  push(text("Column B · first.", columnB.id));
  const nestedCallout = push(block("callout", { icon: "🧪" }, columnB.id));
  push(text("Callout nested in column B.", nestedCallout.id));

  const openToggle = push(
    block("toggleHeading", { level: 3, text: "Expanded toggle" })
  );
  push(text("Toggle child one.", openToggle.id));
  push(text("Toggle child two.", openToggle.id));

  const closedToggle = push(
    block("toggleHeading", {
      level: 3,
      text: "Collapsed toggle",
      collapsed: true,
    })
  );
  push(text("Hidden toggle child.", closedToggle.id));

  const tabs = push(block("tabs", {}));
  const tabA = push(block("tab", { label: "First tab" }, tabs.id));
  push(text("Tab A · first.", tabA.id));
  push(text("Tab A · second.", tabA.id));
  const tabB = push(block("tab", { label: "Second tab" }, tabs.id));
  push(text("Tab B · only child (inactive by default).", tabB.id));

  const list = push(block("list", { variant: "bullet" }));
  push(text("List item one.", list.id));
  push(text("List item two.", list.id));
  push(text("List item three.", list.id));

  const checklist = push(block("checklist", {}));
  push(
    block(
      "checklistItem",
      { checked: true, text: "Checked item." },
      checklist.id
    )
  );
  push(
    block(
      "checklistItem",
      { checked: false, text: "Unchecked item." },
      checklist.id
    )
  );

  push(
    block("media", {
      kind: "image",
      source: "url",
      src: `data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#4a7c59"/><circle cx="600" cy="400" r="220" fill="#f4f1e8"/><text x="600" y="415" font-size="48" text-anchor="middle" fill="#333">fixture</text></svg>'
      )}`,
      alt: "Fixture image",
      widthPercent: 50,
    })
  );

  push(text("Trailing paragraph below the containers."));

  return blocks;
}

function fixtureRecordExists(): boolean {
  return localPagesCollection.toArray.some(
    (page) => page.id === CANVAS_FIXTURE_PAGE_ID && !isLocallyDeletedPage(page)
  );
}

/** True when the fixture page record exists locally. */
export function canvasFixtureExists(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return fixtureRecordExists();
}

/**
 * (Re)seeds the fixture page: upserts the reserved record and replaces its
 * blocks with a fresh fixture tree. Safe to call repeatedly — a reset button
 * uses it to restore the canonical content after experiments.
 */
export function seedCanvasFixturePage(): void {
  const now = new Date().toISOString();

  if (fixtureRecordExists()) {
    localPagesCollection.update(CANVAS_FIXTURE_PAGE_ID, (draft) => {
      draft.updatedAt = now;
    });
  } else {
    localPagesCollection.insert({
      id: CANVAS_FIXTURE_PAGE_ID,
      slug: CANVAS_FIXTURE_PAGE_SLUG,
      title: CANVAS_FIXTURE_PAGE_TITLE,
      parentId: null,
      serverBaselineHash: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  deleteAllBlocksForPage(readBlockShardForPage(CANVAS_FIXTURE_PAGE_ID));
  seedPageBlocks(CANVAS_FIXTURE_PAGE_ID, buildFixtureBlocks());
}
