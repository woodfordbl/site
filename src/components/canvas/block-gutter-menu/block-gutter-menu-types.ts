import type { getSlashMenuItems } from "@/components/blocks/registry.ts";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";
import type { Block } from "@/lib/schemas/block.ts";

export interface BlockGutterMenuContextValue {
  actionItems: ActionMenuEntry[];
  blockTypeLabel: string | undefined;
  canTurnInto: boolean;
  effectiveBlockId: string | undefined;
  embedBlock: Extract<Block, { type: "embed" }> | null;
  handleAddColumn: () => void;
  handleAddRow: () => void;
  handleDelete: () => void;
  handleDuplicate: () => void;
  handleEmbedCopyLink: () => void;
  handleEmbedOpenInBrowser: () => void;
  handleEmbedReplace: () => void;
  handleEmbedToggleCaption: (enabled: boolean) => void;
  handleFitToWidth: () => void;
  handleToggleHeaderColumn: (enabled: boolean) => void;
  handleToggleHeaderRow: (enabled: boolean) => void;
  handleTurnInto: (key: string) => void;
  hasBlockSpecificActions: boolean;
  lastTableRowId: string | undefined;
  menuOpen: boolean;
  rowId: string;
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
  | "canTurnInto"
  | "embedBlock"
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
  | "handleTurnInto"
  | "lastTableRowId"
  | "tableBlock"
  | "turnIntoItems"
>;
