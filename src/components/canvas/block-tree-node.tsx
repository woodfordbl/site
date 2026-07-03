import { type ComponentType, memo } from "react";

import { BlockRenderer } from "@/components/blocks/block-renderer.tsx";
import {
  getBlockSpec,
  isContainerSpec,
  resolveContainerComponent,
} from "@/components/blocks/registry.ts";
import {
  useCanvasEditorContext,
  useCanvasFocus,
} from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasRowShell } from "@/components/canvas/canvas-row-shell.tsx";
import { RowGutter } from "@/components/canvas/row-gutter.tsx";

import {
  useIsCoarsePrimaryPointer,
  useIsNarrowViewport,
} from "@/hooks/device-layout.ts";

import { blockColorClassName } from "@/lib/blocks/block-colors.ts";
import { getBlockShellSpacingClass } from "@/lib/blocks/block-spacing.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { BlockMode } from "@/lib/canvas/block-spec.types.ts";
import { handleContainerGutterInsert } from "@/lib/canvas/container-gutter-insert.ts";
import { pageTitleBlockAlignClassName } from "@/lib/pages/page-title-layout.ts";
import type { BlockType } from "@/lib/schemas/block.ts";
import { cn } from "@/lib/utils.ts";

/** Minimal inset when the block gutter sits beside the row in edit mode. */
const topLevelPageTitleGutterAlignClassName = "pl-1";

function getTopLevelContentClassName(
  alignWithPageTitle: boolean,
  showGutter: boolean,
  isMobile: boolean
): string | undefined {
  if (!alignWithPageTitle) {
    return;
  }

  if (showGutter && !isMobile) {
    return topLevelPageTitleGutterAlignClassName;
  }

  return pageTitleBlockAlignClassName;
}

interface BlockTreeNodeProps {
  /** Gutter pull override for this row, set by a parent container (e.g. callout). */
  gutterPullClassName?: string;
  mode: BlockMode;
  /** Container type when this row renders inside a container scope (column children). */
  parentType?: BlockType;
  row: CanvasRow;
}

/** Gutter / gesture flags shared by container and leaf rows. */
interface RowChromeProps {
  enableTouchGesture: boolean;
  isMobile: boolean;
  showGutter: boolean;
}

function ContainerRowNode({
  Container,
  enableTouchGesture,
  gutterPullClassName,
  isMobile,
  mode,
  parentType,
  row,
  showGutter,
}: RowChromeProps & {
  Container: ComponentType<{ mode: BlockMode; row: CanvasRow }>;
  gutterPullClassName?: string;
  mode: BlockMode;
  parentType?: BlockType;
  row: CanvasRow;
}) {
  const { insertAfter, insertAtScopeStart, insertBefore } =
    useCanvasEditorContext();
  const isCallout = row.effectiveBlock.type === "callout";
  const isTopLevel = !row.effectiveBlock.parentId;
  const alignWithPageTitle = isTopLevel;

  return (
    <CanvasRowShell
      contentClassName={cn(
        getTopLevelContentClassName(alignWithPageTitle, showGutter, isMobile),
        blockColorClassName(row.effectiveBlock, parentType)
      )}
      enableTouchGesture={enableTouchGesture}
      gutter={
        showGutter ? (
          <RowGutter
            onInsert={(edge) => {
              handleContainerGutterInsert(row, edge, {
                insertAfter,
                insertAtScopeStart,
                insertBefore,
              });
            }}
            row={row}
          />
        ) : null
      }
      gutterPullClassName={gutterPullClassName}
      keepGutterOnNestedHover={isCallout}
      row={row}
    >
      <Container mode={mode} row={row} />
    </CanvasRowShell>
  );
}

function LeafRowNode({
  enableTouchGesture,
  gutterPullClassName,
  isMobile,
  mode,
  parentType,
  row,
  showGutter,
}: RowChromeProps & {
  gutterPullClassName?: string;
  mode: BlockMode;
  parentType?: BlockType;
  row: CanvasRow;
}) {
  const { clearFocus } = useCanvasEditorContext();
  const focus = useCanvasFocus();
  const isFocusTarget = focus?.rowId === row.rowId;

  const block = row.effectiveBlock;
  const isDivider = block.type === "divider";
  const isContainerChild = Boolean(block.parentId);
  const alignWithPageTitle = !isContainerChild;
  const ownsShellSpacing = mode === "edit" && !isContainerChild;

  let contentSpacingClassName: string | undefined;
  if (ownsShellSpacing) {
    contentSpacingClassName = getBlockShellSpacingClass(
      block.type,
      block.type === "heading" ? block.props.level : undefined
    );
  }

  return (
    <CanvasRowShell
      contentClassName={getTopLevelContentClassName(
        alignWithPageTitle,
        showGutter,
        isMobile
      )}
      contentSpacingClassName={contentSpacingClassName}
      enableTouchGesture={enableTouchGesture}
      gutter={showGutter ? <RowGutter row={row} /> : null}
      gutterAlignCenter={isDivider}
      gutterPullClassName={gutterPullClassName}
      row={row}
    >
      <BlockRenderer
        autoFocus={isFocusTarget}
        autoFocusOffset={isFocusTarget ? focus?.offset : undefined}
        autoFocusPlacement={isFocusTarget ? focus?.placement : undefined}
        mode={mode}
        omitShellSpacing={ownsShellSpacing}
        onFocusHandled={clearFocus}
        parentType={parentType}
        row={row}
      />
    </CanvasRowShell>
  );
}

function BlockTreeNodeImpl({
  gutterPullClassName,
  mode,
  parentType,
  row,
}: BlockTreeNodeProps) {
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const isNarrowViewport = useIsNarrowViewport();

  // On coarse pointers the gutter is removed; block actions and reordering move
  // to a long-press drawer / touch drag on the block body instead.
  const editable = mode === "edit";
  const chrome: RowChromeProps = {
    enableTouchGesture: editable && isCoarsePrimaryPointer,
    isMobile: isNarrowViewport,
    showGutter: editable && !isCoarsePrimaryPointer,
  };

  const spec = getBlockSpec(row.effectiveBlock.type);

  if (isContainerSpec(spec)) {
    return (
      <ContainerRowNode
        Container={resolveContainerComponent(spec)}
        gutterPullClassName={gutterPullClassName}
        mode={mode}
        parentType={parentType}
        row={row}
        {...chrome}
      />
    );
  }

  return (
    <LeafRowNode
      gutterPullClassName={gutterPullClassName}
      mode={mode}
      parentType={parentType}
      row={row}
      {...chrome}
    />
  );
}

export const BlockTreeNode = memo(BlockTreeNodeImpl);
