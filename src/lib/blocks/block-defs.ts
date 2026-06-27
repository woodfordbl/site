import { DEFAULT_CALLOUT_ICON } from "@/lib/blocks/callout-defaults.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

/**
 * Per-type block definitions — the single data source for everything a block
 * type declares besides its Zod props schema and its React components:
 * default props, whether it carries primary text, and emptiness.
 *
 * Adding a block type touches three places total:
 * 1. `src/lib/schemas/block-props.ts` + `src/lib/schemas/block.ts` (schema)
 * 2. this file (one `BLOCK_DEFS` entry)
 * 3. `src/components/blocks/registry.ts` (components + slash metadata)
 *
 * `createEmptyBlock`, `getTextFromBlock`, `withBlockText`, and `isBlockEmpty`
 * all derive from these entries.
 */

export type BlockFor<T extends BlockType> = Extract<Block, { type: T }>;

export type PropsFor<T extends BlockType> = BlockFor<T>["props"];

/** Container types render a shell; children are separate rows via `parentId`. */
export const CONTAINER_BLOCK_TYPES = [
  "list",
  "checklist",
  "columns",
  "column",
  "tabs",
  "tab",
  "table",
  "tableRow",
] as const satisfies readonly BlockType[];

export type ContainerBlockType = (typeof CONTAINER_BLOCK_TYPES)[number];

export type LeafBlockType = Exclude<BlockType, ContainerBlockType>;

export function isContainerBlockType(
  type: BlockType
): type is ContainerBlockType {
  return (CONTAINER_BLOCK_TYPES as readonly BlockType[]).includes(type);
}

export function isLeafBlockType(type: BlockType): type is LeafBlockType {
  return !isContainerBlockType(type);
}

interface BlockDef<T extends BlockType> {
  defaultProps: () => PropsFor<T>;
  /** Set when `props.text` is the block's primary editable text. */
  hasPrimaryText?: true;
  /**
   * Blank-block test used by structural actions (empty Backspace/Enter rules).
   * Containers report empty here; row-level emptiness with children is
   * `isRowEmpty` in `is-block-empty.ts`.
   */
  isEmpty: (block: BlockFor<T>) => boolean;
}

function isBlank(value: string | undefined): boolean {
  return (value ?? "").trim().length === 0;
}

const textIsEmpty = (block: { props: { text: string } }): boolean =>
  isBlank(block.props.text);

export const BLOCK_DEFS: { [K in BlockType]: BlockDef<K> } = {
  heading: {
    defaultProps: () => ({ level: 1, text: "" }),
    isEmpty: textIsEmpty,
    hasPrimaryText: true,
  },
  text: {
    defaultProps: () => ({ text: "" }),
    isEmpty: textIsEmpty,
    hasPrimaryText: true,
  },
  list: {
    defaultProps: () => ({ variant: "bullet" }),
    isEmpty: () => true,
  },
  quote: {
    defaultProps: () => ({ text: "" }),
    isEmpty: textIsEmpty,
    hasPrimaryText: true,
  },
  callout: {
    defaultProps: () => ({ text: "", icon: DEFAULT_CALLOUT_ICON }),
    isEmpty: textIsEmpty,
    hasPrimaryText: true,
  },
  checklist: {
    defaultProps: () => ({}),
    isEmpty: () => true,
  },
  checklistItem: {
    defaultProps: () => ({ text: "", checked: false }),
    isEmpty: textIsEmpty,
    hasPrimaryText: true,
  },
  pageLink: {
    defaultProps: () => ({ pageId: "" }),
    isEmpty: () => false,
  },
  divider: {
    defaultProps: () => ({}),
    isEmpty: () => true,
  },
  columns: {
    defaultProps: () => ({}),
    isEmpty: () => true,
  },
  column: {
    defaultProps: () => ({}),
    isEmpty: () => true,
  },
  tabs: {
    defaultProps: () => ({}),
    isEmpty: () => true,
  },
  tab: {
    defaultProps: () => ({ label: "" }),
    isEmpty: () => true,
  },
  media: {
    defaultProps: () => ({ kind: "image", source: "url", src: "" }),
    isEmpty: (block) => isBlank(block.props.src),
  },
  embed: {
    defaultProps: () => ({ url: "" }),
    isEmpty: (block) => isBlank(block.props.url),
  },
  table: {
    defaultProps: () => ({
      hasHeaderRow: true,
      hasHeaderColumn: false,
      columnWidths: [1, 1, 1],
    }),
    isEmpty: () => true,
  },
  tableRow: {
    defaultProps: () => ({}),
    isEmpty: () => true,
  },
  tableCell: {
    defaultProps: () => ({ text: "" }),
    isEmpty: textIsEmpty,
    hasPrimaryText: true,
  },
};

export function getBlockDef<T extends BlockType>(type: T): BlockDef<T> {
  return BLOCK_DEFS[type];
}
