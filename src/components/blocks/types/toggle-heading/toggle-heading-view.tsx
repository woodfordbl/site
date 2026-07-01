import { HeadingCollapseChevron } from "@/components/blocks/types/heading/heading-collapse-toggle.tsx";
import { BlockTreeNode } from "@/components/canvas/block-tree-node.tsx";
import {
  useCanvasEditorContext,
  useCanvasFocus,
} from "@/components/canvas/canvas-editor-context.tsx";
import { useHeadingCollapse } from "@/components/canvas/heading-collapse-context.tsx";
import { useDropTarget } from "@/components/dnd/use-dnd.ts";
import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { RichTextContent } from "@/components/editor/rich-text.tsx";
import { getBlockShellSpacingClass } from "@/lib/blocks/block-spacing.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";
import type { DropTarget } from "@/lib/canvas/resolve-drop-target.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Toggle heading: a container that renders its own heading title plus a
 * collapse chevron, and owns its content as real children. Collapsing simply
 * stops rendering the children — no sibling-range filtering. The editable title
 * lives here (not via a leaf `Edit`) because container specs have no leaf
 * surface; mirrors how `TabsView` edits its own container props.
 */
export function ToggleHeadingView({ row, mode }: BlockContainerProps) {
  const { clearFocus, dispatch, insertAtScopeStart } = useCanvasEditorContext();
  const focus = useCanvasFocus();
  const { isCollapsed, toggle } = useHeadingCollapse();
  const showScopeStart = useDropTarget(
    (target: DropTarget | null) =>
      target?.rowId === row.rowId && target.atScopeStart === true
  );

  const block = row.effectiveBlock;
  if (block.type !== "toggleHeading") {
    return null;
  }

  const { level, text } = block.props;
  const collapsed = isCollapsed(row);
  const isFocusTarget = focus?.rowId === row.rowId;
  const Tag = `h${level}` as const;
  const isTopLevel = !block.parentId;
  const topSpacing =
    mode === "edit" && isTopLevel
      ? getBlockShellSpacingClass("toggleHeading", level)
      : undefined;

  return (
    <div className={cn(topSpacing)}>
      <div
        className="flex w-fit max-w-full items-center gap-1"
        data-reveal-group=""
      >
        {mode === "edit" ? (
          <EditableSurface
            ariaLabel="Toggle heading"
            autoFocus={isFocusTarget}
            autoFocusOffset={isFocusTarget ? focus?.offset : undefined}
            autoFocusPlacement={isFocusTarget ? focus?.placement : undefined}
            className={cn(
              headingSurfaceClassName,
              headingTypographyClassNames[level],
              // Shrink the field to its text so the chevron can sit right
              // after it; hold room for the placeholder while empty.
              "w-fit! max-w-full empty:min-w-52"
            )}
            marks={block.props.marks ?? []}
            onAutoFocusHandled={clearFocus}
            onChange={(next, marks) =>
              dispatch({
                type: "row.update",
                rowId: row.rowId,
                block: {
                  ...block,
                  props: { ...block.props, text: next, marks },
                },
              })
            }
            onEnter={() => insertAtScopeStart(row.rowId)}
            onStructuralKey={(caretAtStart, key) => {
              if (key !== "Backspace" || !caretAtStart) {
                return false;
              }
              // Backspace at the title start collapses the toggle back to a
              // plain heading; the reducer lifts its children out as siblings.
              dispatch({
                type: "row.convert",
                rowId: row.rowId,
                to: "heading",
                options: { headingLevel: level, text },
              });
              return true;
            }}
            placeholder={`Toggle heading ${level}`}
            placeholderVisibility="when-empty"
            value={text}
          />
        ) : (
          <Tag
            className={cn(
              headingSurfaceClassName,
              headingTypographyClassNames[level]
            )}
          >
            {text ? (
              <RichTextContent marks={block.props.marks} text={text} />
            ) : (
              " "
            )}
          </Tag>
        )}
        <HeadingCollapseChevron
          collapsed={collapsed}
          onToggle={() => toggle(row)}
        />
      </div>
      {collapsed ? null : (
        <div
          className={cn(
            "relative flex min-w-0 flex-col gap-0",
            row.children.length === 0 && "min-h-9"
          )}
          data-toggle-content
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
              parentType="toggleHeading"
              row={child}
            />
          ))}
        </div>
      )}
    </div>
  );
}
