/**
 * Canvas and page effect unions consumed by reducers and dispatch hooks.
 * @see docs/architecture/canvas-editor.md
 * @see docs/reference/page-commands.md
 */
import type { RowPlacement } from "@/lib/blocks/row-placement.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import type { PageRepositionPlan } from "@/lib/pages/reposition-page.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type {
  DatabaseRowSource,
  DatabaseSource,
} from "@/lib/schemas/local-page.ts";
import type {
  PageFont,
  PageHeaderImage,
  PageTextScale,
} from "@/lib/schemas/page-settings.ts";

export type CanvasEffect =
  | { type: "persist"; rowId: string; block: Block }
  | {
      type: "insert";
      position: RowPlacement;
      block: Block;
      focus?: boolean;
      focusPlacement?: "start" | "end";
    }
  | { type: "delete"; rowId: string }
  | {
      type: "move";
      rowId: string;
      position: RowPlacement;
    }
  | {
      type: "focus";
      rowId: string;
      placement?: "start" | "end";
      offset?: number;
      embedAction?: "replace" | "caption";
      calloutAction?: "editIcon";
    }
  | {
      type: "columns.apply";
      blocks: Block[];
      focusRowId: string;
    }
  | {
      type: "tabs.apply";
      blocks: Block[];
      focusRowId: string;
    }
  | {
      type: "table.apply";
      blocks: Block[];
      focusRowId: string;
    }
  | { type: "page.revertToServer" }
  | { type: "page.acknowledgeServerBaseline" };

/** Page lifecycle effects applied by `usePageDispatch` (not `canvasReducer`). @see docs/reference/page-commands.md */
export type PageEffect =
  | {
      type: "page.persist";
      pageId: string;
      slug: string;
      title: string;
      parentId?: string | null;
      /** Row-page materialization marker persisted onto the created page. */
      databaseRowSource?: DatabaseRowSource;
      /** Database hub marker persisted onto the created page. */
      databaseSource?: DatabaseSource;
      sidebarOrder?: number;
      create: boolean;
      previousSlug?: string;
      initialBlocks?: Block[];
      /** Emoji or `tabler:IconName` seeded on create (duplicate, template). */
      icon?: string;
      /** Cover ("header") image seeded on create (duplicate, template). */
      headerImage?: PageHeaderImage;
      /** Body font seeded on create (template). */
      font?: PageFont;
      /** Full-width layout seeded on create (template). */
      fullWidth?: boolean;
      /** Text size seeded on create (template). */
      textScale?: PageTextScale;
    }
  | { type: "page.delete"; pageId: string }
  | { type: "page.resetToRemote"; pageId: string }
  | { type: "page.resetAllToRemote" }
  | {
      type: "page.reposition";
      plan: PageRepositionPlan;
      seed?: PageMetadataSeed;
      parentSeed?: PageMetadataSeed;
      seedsByPageId?: Record<string, PageMetadataSeed>;
    }
  | {
      type: "navigate";
      slug: string;
      mode?: "router" | "history";
      userPage?: boolean;
    };

export type FocusState = {
  rowId: string;
  placement?: "start" | "end";
  offset?: number;
  embedAction?: "replace" | "caption";
  calloutAction?: "editIcon";
} | null;

export interface CanvasPersistenceApi {
  acknowledgeServerBaseline: () => void;
  deleteRow: (rowId: string) => void;
  insertRow: (position: RowPlacement, block: Block) => string;
  moveRow: (rowId: string, position: RowPlacement) => void;
  revertToServer: () => void;
  savePageBlocks: (blocks: Block[]) => void;
  saveRow: (rowId: string, block: Block) => void;
}
