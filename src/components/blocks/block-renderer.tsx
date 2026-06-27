import { BlockShell } from "@/components/blocks/block-shell.tsx";
import { getBlockSpec, isLeafSpec } from "@/components/blocks/registry.ts";
import { useBlockFieldActions } from "@/hooks/use-block-field-actions.ts";
import {
  isContainerBlockType,
  type LeafBlockType,
} from "@/lib/blocks/block-defs.ts";
import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { getBlockShellSpacingClass } from "@/lib/blocks/block-spacing.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type {
  BlockMode,
  BlockViewComponent,
  LeafBlockSpec,
} from "@/lib/canvas/block-spec.types.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

interface BlockRendererProps {
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  mode: BlockMode;
  omitShellSpacing?: boolean;
  onFocusHandled?: () => void;
  /** Container type when this row renders inside a container scope. */
  parentType?: BlockType;
  row: CanvasRow;
}

export function BlockRenderer({
  autoFocus = false,
  autoFocusOffset,
  autoFocusPlacement,
  mode,
  omitShellSpacing = false,
  onFocusHandled,
  parentType,
  row,
}: BlockRendererProps) {
  const block = row.effectiveBlock;
  const indentLevel = getBlockIndent(block);
  const isContainerChild = Boolean(block.parentId);
  const spacingClassName =
    isContainerChild || omitShellSpacing
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
      indent={isContainerChild ? 0 : indentLevel}
      spacingClassName={spacingClassName}
    >
      {mode === "view" ? (
        <BlockView block={block} row={row} />
      ) : (
        <LeafBlockEdit
          autoFocus={autoFocus}
          autoFocusOffset={autoFocusOffset}
          autoFocusPlacement={autoFocusPlacement}
          onAutoFocusHandled={onFocusHandled}
          parentType={parentType}
          row={row}
        />
      )}
    </BlockShell>
  );
}

function BlockView({ block, row }: { block: Block; row: CanvasRow }) {
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
  return <View props={leafBlock.props} row={row} />;
}

function LeafBlockEdit({
  autoFocus,
  autoFocusOffset,
  autoFocusPlacement,
  onAutoFocusHandled,
  parentType,
  row,
}: {
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  onAutoFocusHandled?: () => void;
  parentType?: BlockType;
  row: CanvasRow;
}) {
  const block = row.effectiveBlock as Extract<Block, { type: LeafBlockType }>;
  const spec = getBlockSpec(block.type);
  const leafSpec = isLeafSpec(spec)
    ? (spec as LeafBlockSpec<LeafBlockType>)
    : null;

  if (!leafSpec) {
    return null;
  }

  return (
    <LeafBlockEditInner
      autoFocus={autoFocus}
      autoFocusOffset={autoFocusOffset}
      autoFocusPlacement={autoFocusPlacement}
      block={block}
      leafSpec={leafSpec}
      onAutoFocusHandled={onAutoFocusHandled}
      parentType={parentType}
      row={row}
    />
  );
}

function LeafBlockEditInner({
  autoFocus,
  autoFocusOffset,
  autoFocusPlacement,
  block,
  leafSpec,
  onAutoFocusHandled,
  parentType,
  row,
}: {
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  block: Extract<Block, { type: LeafBlockType }>;
  leafSpec: LeafBlockSpec<LeafBlockType>;
  onAutoFocusHandled?: () => void;
  parentType?: BlockType;
  row: CanvasRow;
}) {
  const { Edit, keyboardProps, onChange } = useBlockFieldActions({
    autoFocus,
    autoFocusOffset,
    autoFocusPlacement,
    block,
    leafSpec,
    onAutoFocusHandled,
    row,
  });

  return (
    <Edit
      mode="edit"
      onChange={onChange}
      parentType={parentType}
      props={block.props}
      row={row}
      {...keyboardProps}
    />
  );
}
