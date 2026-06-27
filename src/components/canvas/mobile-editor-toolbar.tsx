"use client";

import {
  IconArrowDown,
  IconArrowUp,
  IconExchange,
  IconIndentDecrease,
  IconIndentIncrease,
  IconKeyboardOff,
  IconPlus,
} from "@tabler/icons-react";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { MobileBlockTypePicker } from "@/components/canvas/mobile-block-type-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { useVisualViewportKeyboard } from "@/hooks/use-visual-viewport-keyboard.ts";
import { findRowById, findRowContext } from "@/lib/blocks/block-tree.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";
import { getActiveCanvasRowId } from "@/lib/canvas/block-selection.ts";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";

type PickerMode = "add" | "turnInto";

/** Button that runs its action without stealing focus from the editor field, so
 *  the on-screen keyboard stays open (same pattern as the slash-menu rows). */
function ToolbarButton({
  children,
  label,
  onPress,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className="shrink-0 text-muted-foreground"
      onClick={onPress}
      onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
        // Keep the editor field focused (don't dismiss the keyboard).
        event.preventDefault();
      }}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

/**
 * Mobile (coarse pointer) command bar pinned above the on-screen keyboard while a
 * canvas block field is focused. Buttons add a block, convert the current block,
 * indent/outdent, move it up/down, and dismiss the keyboard — all driven by the
 * shared canvas command set. Mounted once at the editor root.
 */
export function MobileEditorToolbar() {
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const keyboard = useVisualViewportKeyboard();
  const { dispatch, getRows, insertAfter } = useCanvasEditorContext();

  // Row of the focused field (null when focus is on the title or off-canvas).
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  // Captured when a picker opens, since opening it blurs the field.
  const pickerTargetRef = useRef<string | null>(null);

  useEffect(() => {
    const onFocusIn = () => setFocusedRowId(getActiveCanvasRowId());
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const resolveTargetRowId = useCallback(
    () => getActiveCanvasRowId() ?? focusedRowId,
    [focusedRowId]
  );

  const handleIndent = useCallback(
    (delta: -1 | 1) => {
      const rowId = resolveTargetRowId();
      if (rowId) {
        dispatch({ type: "indent.adjust", rowId, delta });
      }
    },
    [dispatch, resolveTargetRowId]
  );

  const handleMove = useCallback(
    (direction: "up" | "down") => {
      const rowId = resolveTargetRowId();
      if (rowId) {
        dispatch({ type: "row.moveAdjacent", rowId, direction });
      }
    },
    [dispatch, resolveTargetRowId]
  );

  const handleDismiss = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  }, []);

  const openPicker = useCallback(
    (mode: PickerMode) => {
      const rowId = resolveTargetRowId();
      if (!rowId) {
        return;
      }
      pickerTargetRef.current = rowId;
      setPickerMode(mode);
    },
    [resolveTargetRowId]
  );

  const handlePick = useCallback(
    (item: SlashMenuItem) => {
      const rowId = pickerTargetRef.current;
      const mode = pickerMode;
      // Close the sheet first so it dismisses regardless of the edit below.
      setPickerMode(null);
      if (!(rowId && mode)) {
        return;
      }

      if (mode === "turnInto") {
        const row = findRowById(getRows(), rowId);
        if (row) {
          applyBlockConversion(row, item, dispatch);
          dispatch({ type: "focus.set", rowId, placement: "start" });
        }
        return;
      }

      // mode === "add": insert an empty block after the target, then convert the
      // new row (covers headings, lists, columns, tables — types row.insert can't
      // create directly).
      insertAfter(rowId, { initialText: "" });
      const context = findRowContext(getRows(), rowId);
      const newRow = context?.siblings[context.index + 1] ?? null;
      if (newRow) {
        applyBlockConversion(newRow, item, dispatch);
        dispatch({
          type: "focus.set",
          rowId: newRow.rowId,
          placement: "start",
        });
      }
    },
    [dispatch, getRows, insertAfter, pickerMode]
  );

  if (!isCoarsePrimaryPointer) {
    return null;
  }

  const showBar =
    keyboard.isOpen && focusedRowId !== null && pickerMode === null;

  return (
    <>
      {showBar ? (
        <div
          className="fixed inset-x-0 z-40 border-border border-t bg-popover/95 supports-backdrop-filter:bg-popover/80 supports-backdrop-filter:backdrop-blur"
          role="toolbar"
          style={{ bottom: keyboard.height }}
        >
          <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
            <ToolbarButton label="Add block" onPress={() => openPicker("add")}>
              <IconPlus aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Turn into"
              onPress={() => openPicker("turnInto")}
            >
              <IconExchange aria-hidden />
            </ToolbarButton>
            <ToolbarButton label="Outdent" onPress={() => handleIndent(-1)}>
              <IconIndentDecrease aria-hidden />
            </ToolbarButton>
            <ToolbarButton label="Indent" onPress={() => handleIndent(1)}>
              <IconIndentIncrease aria-hidden />
            </ToolbarButton>
            <ToolbarButton label="Move up" onPress={() => handleMove("up")}>
              <IconArrowUp aria-hidden />
            </ToolbarButton>
            <ToolbarButton label="Move down" onPress={() => handleMove("down")}>
              <IconArrowDown aria-hidden />
            </ToolbarButton>
            <div className="ml-auto flex shrink-0 items-center">
              <ToolbarButton label="Close keyboard" onPress={handleDismiss}>
                <IconKeyboardOff aria-hidden />
              </ToolbarButton>
            </div>
          </div>
        </div>
      ) : null}
      <MobileBlockTypePicker
        onOpenChange={(open) => {
          if (!open) {
            setPickerMode(null);
          }
        }}
        onSelect={handlePick}
        open={pickerMode !== null}
        title={pickerMode === "add" ? "Add block" : "Turn into"}
      />
    </>
  );
}
