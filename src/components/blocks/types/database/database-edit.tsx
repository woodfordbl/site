import { IconDatabase } from "@tabler/icons-react";
import { useCallback, useRef } from "react";

import { DatabaseTableView } from "@/components/database/database-table-view.tsx";
import { PlaceholderTrigger } from "@/components/ui/placeholder-trigger.tsx";
import { createDatabaseWithDefaults } from "@/db/queries/database-collection-ops.ts";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { useInlineCustomBlockKeys } from "@/hooks/use-inline-custom-block-keys.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { createDefaultDatabaseSeed } from "@/lib/databases/database-defaults.ts";

type DatabaseEditProps = BlockEditProps<"database">;

/**
 * Editable `database` block: an unlinked block shows the shared placeholder
 * trigger whose single action creates a default database and links it; a
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
  const hasDatabase = props.databaseId !== "";

  const applyAutoFocus = useCallback(() => {
    focusRef.current?.focus();
  }, []);

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

  const handleCreateDatabase = () => {
    const seed = createDefaultDatabaseSeed();
    createDatabaseWithDefaults(seed);
    onChange({ ...props, databaseId: seed.database.id });
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
      <PlaceholderTrigger
        icon={<IconDatabase />}
        onClick={handleCreateDatabase}
        onKeyDown={handleKeyDown}
        ref={focusRef as React.RefObject<HTMLButtonElement>}
      >
        New table database
      </PlaceholderTrigger>
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
      <DatabaseTableView databaseId={props.databaseId} mode="edit" />
    </div>
  );
}
