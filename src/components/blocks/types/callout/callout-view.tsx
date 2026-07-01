import { type ReactNode, useEffect, useState } from "react";

import { BlockTreeNode } from "@/components/canvas/block-tree-node.tsx";
import {
  useCanvasEditorContext,
  useCanvasFocus,
} from "@/components/canvas/canvas-editor-context.tsx";
import { useDropTarget } from "@/components/dnd/use-dnd.ts";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import { listMarkerCellClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";
import type { DropTarget } from "@/lib/canvas/resolve-drop-target.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Gutter pull for callout children when the callout has no icon. The body is
 * flush-left, so the default pull would land child drag handles on top of the
 * callout's own margin handle; a smaller pull insets them so both are reachable.
 * With an icon the children are already indented past it, so the default applies.
 */
const CALLOUT_FLUSH_CHILD_GUTTER_PULL = "-ml-5 md:-ml-7";

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
  const { clearFocus, dispatch } = useCanvasEditorContext();
  const focus = useCanvasFocus();
  const [pickerOpen, setPickerOpen] = useState(false);
  const showScopeStart = useDropTarget(
    (target: DropTarget | null) =>
      target?.rowId === row.rowId && target.atScopeStart === true
  );

  // The gutter menu's "Edit icon" hands off via focus to open the inline picker.
  const editIconRequested =
    focus?.rowId === row.rowId && focus?.calloutAction === "editIcon";
  useEffect(() => {
    if (editIconRequested) {
      setPickerOpen(true);
      clearFocus();
    }
  }, [editIconRequested, clearFocus]);

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
          onOpenChange={setPickerOpen}
          onRemove={() => setIcon(undefined)}
          onSelect={(next) => setIcon(next)}
          open={pickerOpen}
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
        data-canvas-scope={row.rowId}
      >
        {showScopeStart ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 -translate-y-1/2 bg-selection-primary"
          />
        ) : null}
        {row.children.map((child) => (
          <BlockTreeNode
            gutterPullClassName={
              icon ? undefined : CALLOUT_FLUSH_CHILD_GUTTER_PULL
            }
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
