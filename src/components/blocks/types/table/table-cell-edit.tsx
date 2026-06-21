import { useCallback } from "react";
import {
  useCanvasEditorContext,
  useCanvasFocus,
} from "@/components/canvas/canvas-editor-context.tsx";
import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { canvasEditTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type TableCellEditProps = BlockEditProps<"tableCell"> & {
  onCellFocus?: () => void;
};

export function TableCellEdit({
  props,
  onChange,
  row,
  autoFocus,
  autoFocusOffset,
  autoFocusPlacement,
  onAutoFocusHandled,
  onCellFocus,
}: TableCellEditProps) {
  const { dispatch, clearSelection } = useCanvasEditorContext();
  const focus = useCanvasFocus();
  const rowId = row?.rowId ?? "";
  const isFocusTarget = focus?.rowId === rowId;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Tab") {
        event.preventDefault();
        dispatch({
          type: "table.focusCell",
          cellRowId: rowId,
          direction: event.shiftKey ? "previous" : "next",
        });
        return true;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        dispatch({
          type: "table.focusCell",
          cellRowId: rowId,
          direction: "down",
        });
        return true;
      }

      return false;
    },
    [dispatch, rowId]
  );

  return (
    <EditableSurface
      ariaLabel="Table cell"
      autoFocus={autoFocus ?? isFocusTarget}
      autoFocusOffset={
        autoFocusOffset ?? (isFocusTarget ? focus?.offset : undefined)
      }
      autoFocusPlacement={
        autoFocusPlacement ?? (isFocusTarget ? focus?.placement : undefined)
      }
      className={cn(
        canvasEditTextClassName,
        "w-full min-w-0 whitespace-pre-wrap"
      )}
      multiline
      onAutoFocusHandled={onAutoFocusHandled}
      onChange={(text) => onChange({ ...props, text })}
      onKeyDown={handleKeyDown}
      onTextFocus={() => {
        clearSelection();
        onCellFocus?.();
      }}
      placeholder=""
      value={props.text}
    />
  );
}
