import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { computeHiddenRowIds } from "@/lib/blocks/heading-collapse.ts";

/**
 * Shared collapse state for collapsible headings. Two providers implement the
 * same interface so the editor and the read-only view toggle headings the same
 * way:
 * - {@link EditorHeadingCollapseProvider} persists `collapsed` through the
 *   canvas reducer, so it reads purely from block props (no local state to go
 *   stale on undo).
 * - {@link ReadOnlyHeadingCollapseProvider} layers a per-session override over
 *   the persisted default so visitors can expand/collapse without saving.
 */
interface HeadingCollapseValue {
  isCollapsed: (row: CanvasRow) => boolean;
  toggle: (row: CanvasRow) => void;
}

function persistedCollapsed(row: CanvasRow): boolean {
  const block = row.effectiveBlock;
  return block.type === "heading" && block.props.collapsed === true;
}

const HeadingCollapseContext = createContext<HeadingCollapseValue>({
  isCollapsed: () => false,
  toggle: () => undefined,
});

export function useHeadingCollapse(): HeadingCollapseValue {
  return useContext(HeadingCollapseContext);
}

/** Editor: collapse state lives in block props and persists via the reducer. */
export function EditorHeadingCollapseProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { dispatch } = useCanvasEditorContext();

  const toggle = useCallback(
    (row: CanvasRow) => {
      const block = row.effectiveBlock;
      if (block.type !== "heading") {
        return;
      }
      dispatch({
        type: "row.update",
        rowId: row.rowId,
        block: {
          ...block,
          props: { ...block.props, collapsed: !block.props.collapsed },
        },
      });
    },
    [dispatch]
  );

  const value = useMemo<HeadingCollapseValue>(
    () => ({ isCollapsed: persistedCollapsed, toggle }),
    [toggle]
  );

  return (
    <HeadingCollapseContext.Provider value={value}>
      {children}
    </HeadingCollapseContext.Provider>
  );
}

/** Read-only view: a per-session override map over the persisted default. */
export function ReadOnlyHeadingCollapseProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<Map<string, boolean>>(
    () => new Map()
  );

  const isCollapsed = useCallback(
    (row: CanvasRow) => overrides.get(row.rowId) ?? persistedCollapsed(row),
    [overrides]
  );

  const toggle = useCallback((row: CanvasRow) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      const current = prev.get(row.rowId) ?? persistedCollapsed(row);
      next.set(row.rowId, !current);
      return next;
    });
  }, []);

  const value = useMemo<HeadingCollapseValue>(
    () => ({ isCollapsed, toggle }),
    [isCollapsed, toggle]
  );

  return (
    <HeadingCollapseContext.Provider value={value}>
      {children}
    </HeadingCollapseContext.Provider>
  );
}

/**
 * Filter one sibling scope down to the rows that should be mounted, hiding the
 * content under collapsed headings. Applied at every scope-mapping site (page
 * body and column children) so a hidden row is simply never rendered.
 */
export function useVisibleScopeRows(rows: CanvasRow[]): CanvasRow[] {
  const { isCollapsed } = useHeadingCollapse();

  return useMemo(() => {
    const hidden = computeHiddenRowIds(rows, isCollapsed);
    if (hidden.size === 0) {
      return rows;
    }
    return rows.filter((row) => !hidden.has(row.rowId));
  }, [rows, isCollapsed]);
}
