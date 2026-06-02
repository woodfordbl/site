import type { RowPlacement } from "@/lib/blocks/row-placement.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

export type CanvasEffect =
  | { type: "persist"; rowId: string; block: Block }
  | {
      type: "insert";
      position: RowPlacement;
      block: Block;
      focus?: boolean;
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
    }
  | { type: "page.revertToServer" }
  | { type: "page.acknowledgeServerBaseline" }
  | {
      type: "author.save";
      pageId: string;
      blocks: Block[];
      title: string;
      slug: string;
    };

export type PageEffect =
  | {
      type: "page.persist";
      pageId: string;
      slug: string;
      title: string;
      parentId?: string | null;
      create: boolean;
      previousSlug?: string;
      initialBlocks?: Block[];
    }
  | { type: "page.delete"; pageId: string }
  | { type: "navigate"; pageId: string; mode?: "router" }
  | { type: "navigate"; slug: string; mode: "history" };

export type FocusState = {
  rowId: string;
  placement?: "start" | "end";
  offset?: number;
} | null;

export interface CanvasPersistenceApi {
  acknowledgeServerBaseline: () => void;
  deleteRow: (rowId: string) => void;
  insertRow: (position: RowPlacement, block: Block) => string;
  moveRow: (rowId: string, position: RowPlacement) => void;
  revertToServer: () => void;
  saveAuthorPage: (
    pageId: string,
    blocks: Block[],
    title: string,
    slug: string
  ) => Promise<void>;
  saveRow: (rowId: string, block: Block) => void;
}

export interface BlockTreeContext {
  getRow: (rowId: string) => CanvasRowState | undefined;
  getRows: () => CanvasRowState[];
  getServerBlock: (sourceBlockId: string) => Block | undefined;
}

export interface CanvasRowState {
  children: CanvasRowState[];
  effectiveBlock: Block;
  rowId: string;
  sortOrder: number;
}

export type ContainerType = Extract<BlockType, "list">;
