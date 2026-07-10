import { IconDatabase } from "@tabler/icons-react";
import { useCallback, useRef, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { DatabaseCreatePanel } from "@/components/database/database-create-panel.tsx";
import { DatabaseTableView } from "@/components/database/database-table-view.tsx";
import { PlaceholderTrigger } from "@/components/ui/placeholder-trigger.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { useInlineCustomBlockKeys } from "@/hooks/use-inline-custom-block-keys.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";

type DatabaseEditProps = BlockEditProps<"database">;

/**
 * Editable `database` block: an unlinked block shows the shared placeholder
 * trigger opening the creation popover (media/embed source-picker
 * conventions) with New, Linked, and Synced tabs; a
 * linked block renders the database's table view in edit mode. All grid
 * complexity lives in `components/database/`.
 */
export function DatabaseEdit({
  autoFocus,
  onAutoFocusHandled,
  onChange,
  props,
  onExtendSelectionDown,
  onExtendSelectionUp,
  onMoveRowDown,
  onMoveRowUp,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
  row,
}: DatabaseEditProps) {
  const focusRef = useRef<HTMLButtonElement | HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasDatabase = props.databaseId !== "";
  const canvas = useCanvasEditorContext();

  // Deleting the database (or opening a block whose database was deleted
  // elsewhere) removes this hosting block rather than leaving a "not found"
  // shell — the block only holds a `databaseId` reference, so once the
  // database is gone the block has nothing to show. Goes through the canvas
  // command bus so the removal is a normal, undoable structural edit.
  const removeSelf = useCallback(() => {
    const rowId = row?.rowId;
    if (rowId) {
      canvas.dispatch({ type: "row.delete", rowId });
    }
  }, [canvas, row?.rowId]);

  const applyAutoFocus = useCallback(() => {
    focusRef.current?.focus();
    if (!hasDatabase) {
      setPickerOpen(true);
    }
  }, [hasDatabase]);

  useAutoFocus({
    enabled: autoFocus,
    onFocus: applyAutoFocus,
    onHandled: onAutoFocusHandled,
  });

  const handleKeyDown = useInlineCustomBlockKeys({
    onExtendSelectionDown,
    onExtendSelectionUp,
    onMoveRowDown,
    onMoveRowUp,
    onNavigateDown,
    onNavigateUp,
    onStructuralKey,
  });

  const handleCreated = (databaseId: string) => {
    setPickerOpen(false);
    onChange({ ...props, databaseId });
  };

  const handleWrapperKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    // Keys from the grid's interactive children (cell inputs, header
    // controls) must never reach the structural handler — a Backspace typed
    // in a cell would otherwise delete the whole block.
    if (event.target !== event.currentTarget) {
      return;
    }
    handleKeyDown(event);
  };

  if (!hasDatabase) {
    return (
      <Popover onOpenChange={setPickerOpen} open={pickerOpen}>
        <PopoverTrigger
          render={
            <PlaceholderTrigger
              icon={<IconDatabase />}
              onKeyDown={handleKeyDown}
              ref={focusRef as React.RefObject<HTMLButtonElement>}
            />
          }
        >
          New, linked, or synced table
        </PopoverTrigger>
        <PopoverContent
          className="w-96"
          finalFocus={false}
          initialFocus={false}
        >
          <DatabaseCreatePanel onCreated={handleCreated} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    // Focusable group for structural keys (cannot be a <button> — the grid
    // hosts interactive children). No focus ring: a ring around the whole
    // database reads as block chrome and fights the select gutter.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: composite block focus surface for structural keys
    // biome-ignore lint/a11y/useSemanticElements: cannot be a <button>; contains interactive children
    <div
      aria-label="Database block"
      className="outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0"
      data-database-block=""
      onKeyDown={handleWrapperKeyDown}
      ref={focusRef as React.RefObject<HTMLDivElement>}
      role="group"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the block itself is the keyboard target
      tabIndex={0}
    >
      <DatabaseTableView
        databaseId={props.databaseId}
        hideTitle={props.hideTitle}
        mode="edit"
        onDeleteDatabase={removeSelf}
        onHideTitleChange={(hideTitle) => onChange({ ...props, hideTitle })}
        onRemoveBlock={removeSelf}
        onViewIdChange={(viewId) => onChange({ ...props, viewId })}
        viewId={props.viewId}
      />
    </div>
  );
}
