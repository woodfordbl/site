import type { SlashPhase } from "@/hooks/use-slash-state.ts";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";

export type CanvasMenuPayload =
  | { kind: "block-actions"; rowId: string }
  | { kind: "slash"; rowId: string };

export interface BlockActionsSession {
  canTurnInto: boolean;
  onConvert: (item: SlashMenuItem) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMenuOpen?: () => void;
  rowId: string;
  triggerId: string;
  turnIntoValue?: string;
}

export interface SlashMenuSession {
  anchorElement: HTMLElement | null;
  confirmSelection: () => void;
  convertRowId?: string;
  currentPageId: string;
  linkSubOpen: boolean;
  onClose: () => void;
  onDismiss: () => void;
  onExitLinkPhase: () => void;
  onLinkSubOpenChange: (open: boolean) => void;
  onPopoverOpenChange: (open: boolean) => void;
  onSelectBlock: (item: SlashMenuItem) => void;
  onSelectPageCreate: () => void;
  onSelectPageLink: (pageId: string) => void;
  pages: PageSummary[];
  query: string;
  rowId: string;
  selectedIndex: number;
  slashCaret: FieldSelection;
  slashPhase: SlashPhase;
  triggerId: string;
}
