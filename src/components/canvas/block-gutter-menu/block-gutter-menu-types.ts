import type { getSlashMenuItems } from "@/components/blocks/registry.ts";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";

export interface BlockGutterMenuContextValue {
  actionItems: ActionMenuEntry[];
  blockBackgroundColor: BlockColor | undefined;
  blockColor: BlockColor | undefined;
  blockTypeLabel: string | undefined;
  calloutBlock: Extract<Block, { type: "callout" }> | null;
  canTurnInto: boolean;
  effectiveBlockId: string | undefined;
  embedBlock: Extract<Block, { type: "embed" }> | null;
  handleAddCalloutIcon: () => void;
  handleAddColumn: () => void;
  handleAddRow: () => void;
  handleDelete: () => void;
  handleDuplicate: () => void;
  handleEmbedCopyLink: () => void;
  handleEmbedOpenInBrowser: () => void;
  handleEmbedReplace: () => void;
  handleEmbedToggleCaption: (enabled: boolean) => void;
  handleFitToWidth: () => void;
  handleRemoveCalloutIcon: () => void;
  handleSetBlockBackground: (color: BlockColor | undefined) => void;
  handleSetBlockColor: (color: BlockColor | undefined) => void;
  handleToggleHeaderColumn: (enabled: boolean) => void;
  handleToggleHeaderRow: (enabled: boolean) => void;
  handleTurnInto: (key: string) => void;
  hasBlockSpecificActions: boolean;
  lastTableRowId: string | undefined;
  menuOpen: boolean;
  rowId: string;
  supportsBlockColor: boolean;
  tableBlock: Extract<Block, { type: "table" }> | null;
  tableColumnCount: number;
  turnIntoItems: ReturnType<typeof getSlashMenuItems>;
  turnIntoValue: string | undefined;
}

export interface BlockGutterMenuProviderProps {
  children: React.ReactNode;
  onConvert?: (item: SlashMenuItem) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  rowId: string;
}

export type BlockGutterMenuProps = Omit<
  BlockGutterMenuProviderProps,
  "children"
>;

export type BlockGutterMenuItemsInput = Pick<
  BlockGutterMenuContextValue,
  | "blockBackgroundColor"
  | "blockColor"
  | "calloutBlock"
  | "canTurnInto"
  | "embedBlock"
  | "handleAddCalloutIcon"
  | "handleRemoveCalloutIcon"
  | "handleDuplicate"
  | "handleDelete"
  | "handleEmbedCopyLink"
  | "handleEmbedOpenInBrowser"
  | "handleEmbedReplace"
  | "handleEmbedToggleCaption"
  | "handleFitToWidth"
  | "handleToggleHeaderColumn"
  | "handleToggleHeaderRow"
  | "handleAddRow"
  | "handleAddColumn"
  | "handleSetBlockBackground"
  | "handleSetBlockColor"
  | "handleTurnInto"
  | "lastTableRowId"
  | "supportsBlockColor"
  | "tableBlock"
  | "turnIntoItems"
>;
