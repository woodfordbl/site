import type { RowPlacement } from "@/lib/blocks/row-placement.ts";
import type { ContainerBlockType } from "@/lib/canvas/block-spec.types.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

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
      structured?: boolean;
    }
  | { type: "row.split"; rowId: string; start: number; end: number }
  | {
      type: "row.move";
      rowId: string;
      targetRowId: string;
      edge: "before" | "after";
    }
  | {
      type: "row.convert";
      rowId: string;
      to: BlockType;
      options?: {
        text?: string;
        indent?: number;
        headingLevel?: 1 | 2 | 3 | 4;
        pageId?: string;
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
      type: "slash.convert";
      rowId: string;
      to: BlockType;
      text?: string;
      headingLevel?: 1 | 2 | 3 | 4;
      pageId?: string;
    }
  | {
      type: "focus.set";
      rowId: string;
      placement?: "start" | "end";
      offset?: number;
    }
  | { type: "focus.clear" }
  | { type: "row.focusAdjacent"; rowId: string; direction: "up" | "down" }
  | { type: "row.moveAdjacent"; rowId: string; direction: "up" | "down" }
  | { type: "page.revertToServer" }
  | { type: "page.acknowledgeServerBaseline" }
  | { type: "author.saveToSource"; pageId: string }
  | { type: "author.loadFromDisk"; pageId: string };

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
  | { type: "page.delete"; pageId: string };

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
