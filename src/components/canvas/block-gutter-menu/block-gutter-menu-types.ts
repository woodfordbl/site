import type { getSlashMenuItems } from "@/components/blocks/registry.ts";
import type { BlockViewOption } from "@/components/canvas/block-gutter-menu/block-gutter-menu-config.ts";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";
import type { Block } from "@/lib/schemas/block.ts";

export interface BlockGutterMenuContextValue {
  actionItems: ActionMenuEntry[];
  blockTypeLabel: string | undefined;
  canTurnInto: boolean;
  handleAddColumn: () => void;
  handleAddRow: () => void;
  handleDelete: () => void;
  handleDuplicate: () => void;
  handleFitToWidth: () => void;
  handleToggleHeaderColumn: (enabled: boolean) => void;
  handleToggleHeaderRow: (enabled: boolean) => void;
  handleTurnInto: (key: string) => void;
  handleViewToggle: (id: string, checked: boolean) => void;
  hasBlockSpecificActions: boolean;
  lastTableRowId: string | undefined;
  menuOpen: boolean;
  resolvedViewChecks: Record<string, boolean>;
  rowId: string;
  tableBlock: Extract<Block, { type: "table" }> | null;
  tableColumnCount: number;
  turnIntoItems: ReturnType<typeof getSlashMenuItems>;
  turnIntoValue: string | undefined;
  viewOptions: { items: BlockViewOption[]; label: string } | undefined;
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
  | "handleDuplicate"
  | "handleDelete"
  | "handleFitToWidth"
  | "handleToggleHeaderColumn"
  | "handleToggleHeaderRow"
  | "handleAddRow"
  | "handleAddColumn"
  | "handleTurnInto"
  | "handleViewToggle"
  | "lastTableRowId"
  | "resolvedViewChecks"
  | "tableBlock"
  | "turnIntoItems"
  | "viewOptions"
>;
