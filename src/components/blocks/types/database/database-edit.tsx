import { IconDatabase } from "@tabler/icons-react";
import { useCallback, useRef, useState } from "react";

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
 * conventions) with a local "New table" path and a connector "Sync" path; a
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
}: DatabaseEditProps) {
  const focusRef = useRef<HTMLButtonElement | HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasDatabase = props.databaseId !== "";

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
          New table — empty or synced from a source
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
    // Visible focus target: keyboard users see where structural keys apply.
    // The grid hosts its own interactive children (cells, headers), so a
    // wrapping <button> would be invalid — a focusable group is correct.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: composite block focus surface for structural keys
    // biome-ignore lint/a11y/useSemanticElements: cannot be a <button>; contains interactive children
    <div
      aria-label="Database block"
      className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
        onHideTitleChange={(hideTitle) => onChange({ ...props, hideTitle })}
        onViewIdChange={(viewId) => onChange({ ...props, viewId })}
        viewId={props.viewId}
      />
    </div>
  );
}
