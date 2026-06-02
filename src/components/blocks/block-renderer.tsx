import { BlockShell } from "@/components/blocks/block-shell.tsx";
import { getBlockSpec, isLeafSpec } from "@/components/blocks/registry.ts";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { useBlockFieldActions } from "@/hooks/use-block-field-actions.ts";
import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { getBlockShellSpacingClass } from "@/lib/blocks/block-spacing.ts";
import type {
  BlockMode,
  BlockViewComponent,
  LeafBlockSpec,
  LeafBlockType,
} from "@/lib/canvas/block-spec.types.ts";
import { isContainerBlockType } from "@/lib/canvas/block-spec.types.ts";
import type { BlockEditKeyboardProps } from "@/lib/editor/block-edit-props.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";
import type { Block } from "@/lib/schemas/block.ts";

interface BlockRendererProps extends BlockEditKeyboardProps {
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  block: Block;
  fieldRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  mode: BlockMode;
  onAutoFocusHandled?: () => void;
  onBlockChange?: (block: Block) => void;
  onFocusHandled?: () => void;
  onSlash?: (query: string, caret: FieldSelection) => void;
  onSlashClose?: () => void;
  onSlashDismiss?: () => void;
  onSlashLinkBack?: () => void;
  onSlashMenuConfirm?: () => void;
  onSlashMenuNavigate?: (direction: "up" | "down") => void;
  onTextFocus?: () => void;
  row?: CanvasRow;
  slashCaret?: FieldSelection;
  slashMenuOpen?: boolean;
  slashPhase?: "root" | "link";
}

export function BlockRenderer({
  block,
  mode,
  row,
  onFocusHandled,
  onAutoFocusHandled,
  onBlockChange,
  autoFocus = false,
  autoFocusOffset,
  autoFocusPlacement,
  fieldRef,
  onSlash,
  onSlashClose,
  onSlashDismiss,
  onSlashLinkBack,
  onSlashMenuConfirm,
  onSlashMenuNavigate,
  slashMenuOpen,
  slashPhase,
  slashCaret,
  onTextFocus,
  onEnter,
  onIndentChange,
  onMarkdownShortcut,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
  indent,
}: BlockRendererProps) {
  const indentLevel = getBlockIndent(block);
  const isListChild = Boolean(row?.effectiveBlock.parentId);
  const spacingClassName = isListChild
    ? undefined
    : getBlockShellSpacingClass(
        block.type,
        block.type === "heading" ? block.props.level : undefined
      );

  if (isContainerBlockType(block.type)) {
    return null;
  }

  return (
    <BlockShell
      indent={isListChild ? 0 : indentLevel}
      spacingClassName={spacingClassName}
    >
      {mode === "view" ? (
        <BlockView block={block} />
      ) : (
        <BlockEdit
          autoFocus={autoFocus}
          autoFocusOffset={autoFocusOffset}
          autoFocusPlacement={autoFocusPlacement}
          block={block}
          fieldRef={fieldRef}
          indent={indent}
          onAutoFocusHandled={onAutoFocusHandled ?? onFocusHandled}
          onBlockChange={onBlockChange}
          onEnter={onEnter}
          onIndentChange={onIndentChange}
          onMarkdownShortcut={onMarkdownShortcut}
          onNavigateDown={onNavigateDown}
          onNavigateUp={onNavigateUp}
          onSlash={onSlash}
          onSlashClose={onSlashClose}
          onSlashDismiss={onSlashDismiss}
          onSlashLinkBack={onSlashLinkBack}
          onSlashMenuConfirm={onSlashMenuConfirm}
          onSlashMenuNavigate={onSlashMenuNavigate}
          onStructuralKey={onStructuralKey}
          onTextFocus={onTextFocus}
          row={row}
          slashCaret={slashCaret}
          slashMenuOpen={slashMenuOpen}
          slashPhase={slashPhase}
        />
      )}
    </BlockShell>
  );
}

function BlockView({ block }: { block: Block }) {
  if (isContainerBlockType(block.type)) {
    return null;
  }

  const leafType = block.type;
  const spec = getBlockSpec(leafType);
  if (!isLeafSpec(spec)) {
    return null;
  }

  const View = spec.View as BlockViewComponent<typeof leafType>;
  const leafBlock = block as Extract<Block, { type: typeof leafType }>;
  return <View props={leafBlock.props} />;
}

function BlockEdit({
  block,
  row,
  onBlockChange,
  onAutoFocusHandled,
  autoFocus,
  autoFocusOffset,
  autoFocusPlacement,
  fieldRef,
  onSlash,
  onSlashClose,
  onSlashDismiss,
  onSlashLinkBack,
  onSlashMenuConfirm,
  onSlashMenuNavigate,
  slashMenuOpen,
  slashPhase,
  slashCaret,
  onTextFocus,
  onEnter,
  onIndentChange,
  onMarkdownShortcut,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
  indent: indentProp,
}: {
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  block: Block;
  fieldRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onAutoFocusHandled?: () => void;
  onBlockChange?: (block: Block) => void;
  onEnter?: BlockEditKeyboardProps["onEnter"];
  onIndentChange?: BlockEditKeyboardProps["onIndentChange"];
  onMarkdownShortcut?: BlockEditKeyboardProps["onMarkdownShortcut"];
  onNavigateDown?: BlockEditKeyboardProps["onNavigateDown"];
  onNavigateUp?: BlockEditKeyboardProps["onNavigateUp"];
  onSlash?: (query: string, caret: FieldSelection) => void;
  onSlashClose?: () => void;
  onSlashDismiss?: () => void;
  onSlashLinkBack?: () => void;
  onSlashMenuConfirm?: () => void;
  onSlashMenuNavigate?: (direction: "up" | "down") => void;
  onStructuralKey?: BlockEditKeyboardProps["onStructuralKey"];
  onTextFocus?: () => void;
  row?: CanvasRow;
  slashCaret?: FieldSelection;
  slashMenuOpen?: boolean;
  slashPhase?: "root" | "link";
  indent?: number;
}) {
  const isLeaf = !isContainerBlockType(block.type);
  const leafType = isLeaf ? block.type : null;
  const spec = leafType ? getBlockSpec(leafType) : null;
  const leafSpec = spec && isLeafSpec(spec) ? spec : null;

  if (!(isLeaf && leafType && leafSpec)) {
    return null;
  }

  const leafBlock = block as Extract<Block, { type: LeafBlockType }>;
  return (
    <LeafBlockEdit
      autoFocus={autoFocus}
      autoFocusOffset={autoFocusOffset}
      autoFocusPlacement={autoFocusPlacement}
      block={leafBlock}
      fieldRef={fieldRef}
      indent={indentProp}
      leafSpec={leafSpec as LeafBlockSpec<LeafBlockType>}
      onAutoFocusHandled={onAutoFocusHandled}
      onBlockChange={onBlockChange}
      onEnter={onEnter}
      onIndentChange={onIndentChange}
      onMarkdownShortcut={onMarkdownShortcut}
      onNavigateDown={onNavigateDown}
      onNavigateUp={onNavigateUp}
      onSlash={onSlash}
      onSlashClose={onSlashClose}
      onSlashDismiss={onSlashDismiss}
      onSlashLinkBack={onSlashLinkBack}
      onSlashMenuConfirm={onSlashMenuConfirm}
      onSlashMenuNavigate={onSlashMenuNavigate}
      onStructuralKey={onStructuralKey}
      onTextFocus={onTextFocus}
      row={row}
      slashCaret={slashCaret}
      slashMenuOpen={slashMenuOpen}
      slashPhase={slashPhase}
    />
  );
}

function LeafBlockEdit({
  block,
  leafSpec,
  row,
  onBlockChange,
  onAutoFocusHandled,
  autoFocus,
  autoFocusOffset,
  autoFocusPlacement,
  fieldRef,
  onSlash,
  onSlashClose,
  onSlashDismiss,
  onSlashLinkBack,
  onSlashMenuConfirm,
  onSlashMenuNavigate,
  slashMenuOpen,
  slashPhase,
  slashCaret,
  onTextFocus,
  onEnter,
  onIndentChange,
  onMarkdownShortcut,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
  indent,
}: {
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  block: Extract<Block, { type: LeafBlockType }>;
  fieldRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  indent?: number;
  leafSpec: LeafBlockSpec<LeafBlockType>;
  onAutoFocusHandled?: () => void;
  onBlockChange?: (block: Block) => void;
  onEnter?: BlockEditKeyboardProps["onEnter"];
  onIndentChange?: BlockEditKeyboardProps["onIndentChange"];
  onMarkdownShortcut?: BlockEditKeyboardProps["onMarkdownShortcut"];
  onNavigateDown?: BlockEditKeyboardProps["onNavigateDown"];
  onNavigateUp?: BlockEditKeyboardProps["onNavigateUp"];
  onSlash?: (query: string, caret: FieldSelection) => void;
  onSlashClose?: () => void;
  onSlashDismiss?: () => void;
  onSlashLinkBack?: () => void;
  onSlashMenuConfirm?: () => void;
  onSlashMenuNavigate?: (direction: "up" | "down") => void;
  onStructuralKey?: BlockEditKeyboardProps["onStructuralKey"];
  onTextFocus?: () => void;
  row?: CanvasRow;
  slashCaret?: FieldSelection;
  slashMenuOpen?: boolean;
  slashPhase?: "root" | "link";
}) {
  const { Edit, keyboardProps, onChange } = useBlockFieldActions({
    autoFocus,
    autoFocusOffset,
    autoFocusPlacement,
    block,
    fieldRef,
    indent,
    leafSpec,
    onAutoFocusHandled,
    onBlockChange,
    onEnter,
    onIndentChange,
    onMarkdownShortcut,
    onNavigateDown,
    onNavigateUp,
    onSlash,
    onSlashClose,
    onSlashDismiss,
    onSlashLinkBack,
    onSlashMenuConfirm,
    onSlashMenuNavigate,
    onStructuralKey,
    onTextFocus,
    row,
    slashCaret,
    slashMenuOpen,
    slashPhase,
  });

  return <Edit onChange={onChange} props={block.props} {...keyboardProps} />;
}
