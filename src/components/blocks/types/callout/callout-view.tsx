import type { ReactNode } from "react";

import { BlockTreeNode } from "@/components/canvas/block-tree-node.tsx";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { useDropTarget } from "@/components/dnd/use-dnd.ts";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import { listMarkerCellClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";
import type { DropTarget } from "@/lib/canvas/resolve-drop-target.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Callout: a container rendered as a padded muted box with an optional leading
 * glyph. Its body is real child blocks (a `text` child by default), so almost
 * any block can be nested inside. The icon picker lives here (not a leaf `Edit`)
 * because container specs have no leaf surface; mirrors how `ToggleHeadingView`
 * edits its own container props. When `props.icon` is absent no glyph slot is
 * rendered at all (no placeholder) and the body sits flush-left — re-add via
 * the block actions menu's "Add icon".
 */
export function CalloutView({ row, mode }: BlockContainerProps) {
  const { dispatch } = useCanvasEditorContext();
  const showScopeStart = useDropTarget(
    (target: DropTarget | null) =>
      target?.rowId === row.rowId && target.atScopeStart === true
  );

  const block = row.effectiveBlock;
  if (block.type !== "callout") {
    return null;
  }

  const { icon } = block.props;
  const setIcon = (next: string | undefined) =>
    dispatch({
      type: "row.update",
      rowId: row.rowId,
      block: { ...block, props: { ...block.props, icon: next } },
    });

  // No icon → render nothing (no placeholder) so the body stays flush-left.
  // Re-add via the block actions menu's "Add icon".
  let iconSlot: ReactNode = null;
  if (icon && mode === "edit") {
    iconSlot = (
      <div className={listMarkerCellClassName}>
        <GlyphIconPicker
          ariaLabel="Change callout icon"
          icon={icon}
          onRemove={() => setIcon(undefined)}
          onSelect={(next) => setIcon(next)}
          triggerButtonSize="icon-sm"
        />
      </div>
    );
  } else if (icon) {
    iconSlot = (
      <div className={listMarkerCellClassName}>
        <span className={iconSlotClassName("icon-sm")}>
          <PageIconDisplay icon={icon} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2">
      {iconSlot}
      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col gap-0",
          row.children.length === 0 && "min-h-9"
        )}
        data-callout-content
      >
        {showScopeStart ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 -translate-y-1/2 bg-selection-primary"
          />
        ) : null}
        {row.children.map((child) => (
          <BlockTreeNode
            key={child.rowId}
            mode={mode}
            parentType="callout"
            row={child}
          />
        ))}
      </div>
    </div>
  );
}
