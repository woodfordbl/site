"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import {
  useBlockActionsMenu,
  useCloseBlockActionsMenuBeforeAction,
} from "@/components/canvas/block-actions-menu.tsx";
import { BlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu.tsx";
import { useCanvasEditorState } from "@/components/canvas/canvas-editor-context.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { useRowBlockActions } from "@/hooks/use-row-block-actions.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

function BlockActionsDrawerPanel({ row }: { row: CanvasRow }) {
  const runAfterClose = useCloseBlockActionsMenuBeforeAction();
  const { onConvert, onDelete, onDuplicate } = useRowBlockActions(row);

  return (
    <MenuPrimitive.Root modal={false}>
      <ScrollArea className="max-h-[min(70vh,32rem)]">
        <div className="p-1" data-canvas-row-menu>
          <BlockGutterMenu
            onConvert={(item) => {
              runAfterClose(() => onConvert(item));
            }}
            onDelete={() => {
              runAfterClose(onDelete);
            }}
            onDuplicate={() => {
              runAfterClose(onDuplicate);
            }}
            rowId={row.rowId}
          />
        </div>
      </ScrollArea>
    </MenuPrimitive.Root>
  );
}

/** Touch-primary block actions: bottom drawer opened by long-press on row content. */
export function BlockActionsDrawer() {
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const { closeBlockActionsMenu, openRowId } = useBlockActionsMenu();
  const { rows } = useCanvasEditorState();
  const row =
    openRowId === null
      ? null
      : (rows.find((entry) => entry.rowId === openRowId) ?? null);

  if (!isCoarsePrimaryPointer) {
    return null;
  }

  return (
    <Drawer
      onOpenChange={(open) => {
        if (!open) {
          closeBlockActionsMenu();
        }
      }}
      open={openRowId !== null}
      repositionInputs={false}
    >
      <DrawerContent className="pb-6" showCloseButton>
        <DrawerHeader className="sr-only">
          <DrawerTitle>Block actions</DrawerTitle>
          <DrawerDescription>
            Turn into, duplicate, delete, and more.
          </DrawerDescription>
        </DrawerHeader>
        {row ? <BlockActionsDrawerPanel row={row} /> : null}
      </DrawerContent>
    </Drawer>
  );
}

/** Opens the touch drawer for a row (no-op on fine pointers). */
export function useOpenBlockActionsDrawer() {
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const { setOpenRowId } = useBlockActionsMenu();

  return (rowId: string, onBeforeOpen?: () => void) => {
    if (!isCoarsePrimaryPointer) {
      return;
    }
    onBeforeOpen?.();
    setOpenRowId(rowId);
  };
}
