import { memo } from "react";

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
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { getBlockShellSpacingClass } from "@/lib/blocks/block-spacing.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { BlockMode } from "@/lib/canvas/block-spec.types.ts";
import { handleContainerGutterInsert } from "@/lib/canvas/container-gutter-insert.ts";
import type { BlockType } from "@/lib/schemas/block.ts";

function getCanvasRowChrome(mode: BlockMode, isCoarsePrimaryPointer: boolean) {
  const edit = mode === "edit";
  return {
    longPressMenu: edit && isCoarsePrimaryPointer,
    showEditGutter: edit && !isCoarsePrimaryPointer,
  };
}

/** Matches page title `PageIconPicker` trigger (`size-9` / 36px). */
const topLevelPageTitleAlignClassName = "pl-9";

interface BlockTreeNodeProps {
  mode: BlockMode;
  /** Container type when this row renders inside a container scope (column children). */
  parentType?: BlockType;
  row: CanvasRow;
}

function BlockTreeNodeImpl({ mode, parentType, row }: BlockTreeNodeProps) {
  const { clearFocus, insertAfter, insertAtScopeStart, insertBefore } =
    useCanvasEditorContext();
  const focus = useCanvasFocus();
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const isFocusTarget = focus?.rowId === row.rowId;
  const { longPressMenu, showEditGutter } = getCanvasRowChrome(
    mode,
    isCoarsePrimaryPointer
  );

  const spec = getBlockSpec(row.effectiveBlock.type);

  if (isContainerSpec(spec)) {
    const Container = resolveContainerComponent(spec);
    const isTable = row.effectiveBlock.type === "table";
    const isTopLevel = !row.effectiveBlock.parentId;
    const alignWithPageTitle = isTopLevel && !isTable;

    return (
      <CanvasRowShell
        contentClassName={
          alignWithPageTitle ? topLevelPageTitleAlignClassName : undefined
        }
        gutter={
          showEditGutter && !isTable ? (
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
        longPressMenu={longPressMenu}
        reserveGutterSpace={showEditGutter && isTable}
        row={row}
      >
        <Container mode={mode} row={row} />
      </CanvasRowShell>
    );
  }

  const block = row.effectiveBlock;
  const isDivider = block.type === "divider";
  const isContainerChild = Boolean(block.parentId);
  const alignWithPageTitle = !isContainerChild;
  let contentSpacingClassName: string | undefined;
  if (showEditGutter && !isContainerChild) {
    contentSpacingClassName =
      block.type === "divider"
        ? "min-h-10 items-center"
        : getBlockShellSpacingClass(
            block.type,
            block.type === "heading" ? block.props.level : undefined
          );
  }

  return (
    <CanvasRowShell
      contentClassName={
        alignWithPageTitle ? topLevelPageTitleAlignClassName : undefined
      }
      contentSpacingClassName={contentSpacingClassName}
      gutter={showEditGutter ? <RowGutter row={row} /> : null}
      gutterAlignCenter={isDivider}
      longPressMenu={longPressMenu}
      row={row}
    >
      <BlockRenderer
        autoFocus={isFocusTarget}
        autoFocusOffset={isFocusTarget ? focus?.offset : undefined}
        autoFocusPlacement={isFocusTarget ? focus?.placement : undefined}
        mode={mode}
        omitShellSpacing={showEditGutter && !isContainerChild}
        onFocusHandled={clearFocus}
        parentType={parentType}
        row={row}
      />
    </CanvasRowShell>
  );
}

export const BlockTreeNode = memo(BlockTreeNodeImpl);
