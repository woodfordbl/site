"use client";

import {
  IconArrowDown,
  IconArrowUp,
  IconExchange,
  IconIndentDecrease,
  IconIndentIncrease,
  IconKeyboardOff,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { MobileBlockTypePicker } from "@/components/canvas/mobile-block-type-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { useHaptics } from "@/hooks/haptics.ts";
import { useKeyboardToolbarAnchor } from "@/hooks/use-visual-viewport-keyboard.ts";
import { findRowById, findRowContext } from "@/lib/blocks/block-tree.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";
import { getActiveCanvasRowId } from "@/lib/canvas/block-selection.ts";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type PickerMode = "add" | "turnInto";

/** Button that runs its action without stealing focus from the editor field, so
 *  the on-screen keyboard stays open (same pattern as the slash-menu rows). */
function ToolbarButton({
  children,
  className,
  label,
  onPress,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onPress: () => void;
}) {
  const haptic = useHaptics();
  return (
    <Button
      aria-label={label}
      className={cn("text-muted-foreground", className)}
      onClick={() => {
        // Each bar action is a discrete tap — fire a light selection tick before
        // delegating so the feedback lands immediately (no-op on desktop / fine
        // pointers via the provider). Mirrors the slash-menu / checkbox pattern.
        haptic("selection");
        onPress();
      }}
      onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
        // Keep the editor field focused (don't dismiss the keyboard).
        event.preventDefault();
      }}
      size="icon"
      type="button"
      variant="outline"
    >
      {children}
    </Button>
  );
}

/**
 * Mobile (coarse pointer) command bar pinned above the on-screen keyboard while a
 * canvas block field is focused. Solid outlined button-groups, portaled to
 * `document.body` so `position: fixed` is viewport-relative. Visibility is driven
 * by focus (not a keyboard-height threshold, which collapses during scroll and
 * would flicker the bar out). Mounted once at the editor root.
 *
 * Positioning is owned per-platform by {@link useKeyboardToolbarAnchor}: on
 * Chromium it flips this element to a `bottom`-anchor and lets CSS resize handle
 * it; on iOS Safari it drives a composited `transform` from the visual viewport.
 * The `top-0` base class below is the iOS anchor; the hook overrides it on
 * Chromium. See [keyboard-toolbar](../../../docs/architecture/keyboard-toolbar.md).
 */
export function MobileEditorToolbar() {
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const { deleteRow, dispatch, getRows, insertAfter } =
    useCanvasEditorContext();

  const anchorRef = useRef<HTMLDivElement>(null);
  // Row of the focused field (null when focus is on the title or off-canvas).
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  // Captured when a picker opens, since opening it blurs the field.
  const pickerTargetRef = useRef<string | null>(null);

  const visible =
    isCoarsePrimaryPointer && focusedRowId !== null && pickerMode === null;
  useKeyboardToolbarAnchor(anchorRef, visible);

  useEffect(() => {
    const onFocusIn = () => setFocusedRowId(getActiveCanvasRowId());
    // Scrolling does not blur the field, so the bar stays put through scroll;
    // only a real blur (keyboard dismissed / focus left the canvas) hides it.
    const onFocusOut = () => {
      requestAnimationFrame(() => setFocusedRowId(getActiveCanvasRowId()));
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
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

  const handleDelete = useCallback(() => {
    const rowId = resolveTargetRowId();
    if (rowId) {
      // `deleteRow` moves focus to the previous row (placement "end"), so the
      // keyboard stays open and the bar follows it up to the new field.
      deleteRow(rowId);
    }
  }, [deleteRow, resolveTargetRowId]);

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
      // Blur the field so the on-screen keyboard hides behind the picker sheet
      // (the row is already captured above, so the edit still targets it).
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
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
          applyBlockConversion(row, item, dispatch, { absorb: true });
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

  if (!isCoarsePrimaryPointer || typeof document === "undefined") {
    return null;
  }

  return (
    <>
      {createPortal(
        <div
          aria-hidden={!visible}
          className={cn(
            // `will-change-transform` + `backface-hidden` keep the bar on its own
            // compositor layer so the per-frame transform (see
            // useKeyboardToolbarAnchor) never triggers layout/paint while tracking
            // the keyboard. Only opacity transitions; the transform is never
            // transitioned, so tracking is instant.
            "backface-hidden fixed inset-x-0 top-0 z-50 flex items-center gap-2 px-3 transition-opacity duration-150 will-change-transform",
            visible ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          ref={anchorRef}
          role="toolbar"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            <ButtonGroup className="shrink-0">
              <ToolbarButton
                label="Add block"
                onPress={() => openPicker("add")}
              >
                <IconPlus aria-hidden />
              </ToolbarButton>
              <ToolbarButton
                label="Turn into"
                onPress={() => openPicker("turnInto")}
              >
                <IconExchange aria-hidden />
              </ToolbarButton>
            </ButtonGroup>
            <ButtonGroup className="shrink-0">
              <ToolbarButton label="Outdent" onPress={() => handleIndent(-1)}>
                <IconIndentDecrease aria-hidden />
              </ToolbarButton>
              <ToolbarButton label="Indent" onPress={() => handleIndent(1)}>
                <IconIndentIncrease aria-hidden />
              </ToolbarButton>
            </ButtonGroup>
            <ButtonGroup className="shrink-0">
              <ToolbarButton label="Move up" onPress={() => handleMove("up")}>
                <IconArrowUp aria-hidden />
              </ToolbarButton>
              <ToolbarButton
                label="Move down"
                onPress={() => handleMove("down")}
              >
                <IconArrowDown aria-hidden />
              </ToolbarButton>
            </ButtonGroup>
            <ButtonGroup className="shrink-0">
              <ToolbarButton
                className="hover:text-destructive active:text-destructive"
                label="Delete block"
                onPress={handleDelete}
              >
                <IconTrash aria-hidden />
              </ToolbarButton>
            </ButtonGroup>
          </div>
          <ButtonGroup className="shrink-0">
            <ToolbarButton label="Close keyboard" onPress={handleDismiss}>
              <IconKeyboardOff aria-hidden />
            </ToolbarButton>
          </ButtonGroup>
        </div>,
        document.body
      )}
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
