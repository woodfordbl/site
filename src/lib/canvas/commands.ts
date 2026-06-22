import type { ContainerBlockType } from "@/lib/blocks/block-defs.ts";
import type { RowPlacement } from "@/lib/blocks/row-placement.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

/** Discriminated union of canvas structural commands. @see docs/reference/canvas-commands.md */
export type CanvasCommand =
  | { type: "row.update"; rowId: string; block: Block }
  | {
      type: "row.insert";
      position: RowPlacement;
      blockType?: BlockType;
      indent?: number;
      initialText?: string;
    }
  | { type: "row.delete"; rowId: string }
  | { type: "selection.delete"; rowIds: string[] }
  | {
      type: "rows.paste";
      targetRowId: string;
      blocks: Block[];
      edge?: "before" | "after";
    }
  | { type: "row.split"; rowId: string; start: number; end: number }
  | {
      type: "row.move";
      rowId: string;
      targetRowId: string;
      edge: "before" | "after";
    }
  | { type: "row.moveToPosition"; rowId: string; position: RowPlacement }
  | {
      type: "row.convert";
      rowId: string;
      to: BlockType;
      options?: {
        text?: string;
        indent?: number;
        headingLevel?: 1 | 2 | 3 | 4;
        pageId?: string;
        pageLinkVariant?: "linked" | "child";
      };
    }
  | { type: "indent.adjust"; rowId: string; delta: -1 | 1 }
  | { type: "block.mergeTextIntoPreviousSibling"; rowId: string }
  | { type: "block.mergeIntoPreviousCanvasRow"; rowId: string }
  | { type: "block.liftAsText"; rowId: string }
  | {
      type: "container.wrap";
      rowId: string;
      containerType: ContainerBlockType;
      variant?: "bullet" | "ordered";
      childText?: string;
    }
  | { type: "container.unwrap"; containerRowId: string }
  | {
      type: "columns.create";
      rowId: string;
      count: 2 | 3 | 4;
      text?: string;
    }
  | { type: "columns.addColumn"; columnsRowId: string }
  | { type: "columns.removeColumn"; columnRowId: string }
  | {
      type: "table.create";
      rowId: string;
      columns?: number;
      rows?: number;
      hasHeaderRow?: boolean;
      text?: string;
    }
  | {
      type: "table.addRow";
      tableRowId: string;
      edge?: "before" | "after";
      focus?: boolean;
    }
  | {
      type: "table.addColumn";
      tableId: string;
      columnIndex: number;
      edge: "before" | "after";
      focus?: boolean;
    }
  | { type: "table.removeRow"; tableRowId: string }
  | { type: "table.removeColumn"; tableId: string; columnIndex: number }
  | { type: "table.duplicateColumn"; tableId: string; columnIndex: number }
  | {
      type: "table.reorderColumn";
      tableId: string;
      fromIndex: number;
      toIndex: number;
    }
  | { type: "table.toggleHeaderRow"; tableId: string; enabled: boolean }
  | { type: "table.toggleHeaderColumn"; tableId: string; enabled: boolean }
  | { type: "table.fitToWidth"; tableId: string; targetWidthPx: number }
  | {
      type: "table.updateColumnWidths";
      tableId: string;
      columnWidths: number[];
    }
  | {
      type: "table.focusCell";
      cellRowId: string;
      direction: "next" | "previous" | "down" | "up";
    }
  | {
      type: "slash.convert";
      rowId: string;
      to: BlockType;
      text?: string;
      headingLevel?: 1 | 2 | 3 | 4;
      pageId?: string;
      pageLinkVariant?: "linked" | "child";
    }
  | {
      type: "focus.set";
      rowId: string;
      placement?: "start" | "end";
      offset?: number;
    }
  | { type: "row.focusAdjacent"; rowId: string; direction: "up" | "down" }
  | { type: "row.moveAdjacent"; rowId: string; direction: "up" | "down" }
  | { type: "page.revertToServer" }
  | { type: "page.acknowledgeServerBaseline" };

/** Page tree and metadata commands (sidebar, title editor). @see docs/reference/page-commands.md */
export type PageCommand =
  | {
      type: "page.create";
      title?: string;
      slug?: string;
      parentId?: string | null;
      pageId?: string;
      navigate?: boolean;
      initialBlocks?: Block[];
    }
  | {
      type: "page.update";
      pageId: string;
      title: string;
      slug?: string;
      previousSlug?: string;
    }
  | { type: "page.delete"; pageId: string }
  | { type: "page.resetToRemote"; pageId: string }
  | { type: "page.resetAllToRemote" }
  | {
      type: "page.reposition";
      pageId: string;
      parentId: string | null;
      insertBeforePageId?: string | null;
      appendPageLinkOnParent?: boolean;
      seed?: {
        blocks: Block[];
        serverBaselineHash: string;
      };
      parentSeed?: {
        blocks: Block[];
        serverBaselineHash: string;
      };
      seedsByPageId?: Record<
        string,
        {
          blocks: Block[];
          serverBaselineHash: string;
        }
      >;
    };

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
