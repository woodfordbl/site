import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";

/** Shared keyboard + indent props for block edit surfaces. */
export interface BlockEditKeyboardProps {
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  hasBlockSelection?: boolean;
  indent?: number;
  onAutoFocusHandled?: () => void;
  onDeleteSelection?: () => void;
  onDuplicate?: () => void;
  onEnter?: (selection: FieldSelection) => void;
  onExtendSelectionDown?: () => void;
  onExtendSelectionUp?: () => void;
  onIndentChange?: (indent: number) => void;
  onMarkdownShortcut?: () => boolean;
  onMoveRowDown?: () => void;
  onMoveRowUp?: () => void;
  onMoveSelectedRowDown?: () => void;
  onMoveSelectedRowUp?: () => void;
  onNavigateDown?: () => void;
  onNavigateUp?: () => void;
  onSlash?: (query: string, caret: FieldSelection) => void;
  onSlashClose?: () => void;
  onSlashDismiss?: () => void;
  onSlashLinkBack?: () => void;
  onSlashMenuConfirm?: () => void;
  onSlashMenuNavigate?: (direction: "up" | "down") => void;
  onStructuralKey?: (
    caretAtStart: boolean,
    key: "Backspace" | "Delete"
  ) => boolean;
  onTextFocus?: () => void;
  slashCaret?: FieldSelection;
  slashMenuOpen?: boolean;
  slashPhase?: "root" | "link";
}
