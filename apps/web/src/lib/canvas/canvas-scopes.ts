import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { hasScopedContent } from "@/lib/canvas/block-container-config.ts";
import { collectRects } from "@/lib/dnd/rects.ts";

/**
 * Marks the content wrapper of a drillable container scope (column, tab,
 * callout, toggle heading), valued with the owning row id. Only mounted scopes
 * exist in the DOM — collapsed toggles and inactive tabs unmount their
 * children, so absence from this collection means the scope is not visible.
 * Containers declare participation via the `scopedContent` config flag.
 */
export const CANVAS_SCOPE_ATTRIBUTE = "data-canvas-scope";

export function collectCanvasScopeRects(): Map<string, DOMRect> {
  return collectRects(CANVAS_SCOPE_ATTRIBUTE);
}

export interface CanvasContentScope {
  children: CanvasRow[];
  rect: DOMRect;
}

/**
 * Content scopes pointer features may route into for a container row, driven
 * by the container config's `scopedContent` flag. Self-scoped containers
 * (callout, toggle heading) expose their own content area — which excludes the
 * heading/icon chrome. Structural wrappers (columns, tabs) expose one scope
 * per scoped child, since `column`/`tab` rows render no shell of their own and
 * their content rect is the only geometry they have. Missing rects mean the
 * scope is unmounted (collapsed toggle, inactive tab) and therefore invisible.
 */
export function rowContentScopes(
  row: CanvasRow,
  scopeRects: ReadonlyMap<string, DOMRect>
): CanvasContentScope[] {
  if (hasScopedContent(row.effectiveBlock.type)) {
    const rect = scopeRects.get(row.rowId);
    return rect ? [{ children: row.children, rect }] : [];
  }

  return row.children.flatMap((child) => {
    if (!hasScopedContent(child.effectiveBlock.type)) {
      return [];
    }
    const rect = scopeRects.get(child.rowId);
    return rect ? [{ children: child.children, rect }] : [];
  });
}
