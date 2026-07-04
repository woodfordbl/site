import {
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import {
  type ColumnDropSpot,
  type ColumnDropZoneRect,
  type GridColumn,
  planColumnReorder,
  resolveColumnDropSpot,
} from "@/components/database/database-grid-helpers.ts";
import {
  DndContext,
  DndSurface,
  type DndSurfaceConfig,
} from "@/components/dnd/dnd-surface.tsx";
import { DragOverlay } from "@/components/dnd/drag-overlay.tsx";
import {
  useDragState,
  useDropTarget,
  useDropZone,
} from "@/components/dnd/use-dnd.ts";
import { updateDatabaseView } from "@/db/queries/database-collection-ops.ts";
import { createDragChannel } from "@/lib/dnd/drag-channel.ts";
import type { DatabaseView } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Column drag-reorder plumbing for the database table grid, built on the
 * shared DnD toolkit: one {@link DndSurface} per grid (kept outside the
 * scroll container, per the table block's wrapper-placement rule), header
 * cells as drag sources, an x-only drop resolver over header rects, a
 * full-grid-height `bg-selection-primary` drop line, and a header-chip drag
 * preview in the React {@link DragOverlay}.
 */

/** Attribute carrying the field id on draggable header cells. */
export const DATABASE_COLUMN_DRAG_ATTRIBUTE = "data-database-column-drag-id";

const databaseColumnChannel = createDragChannel(
  "application/x-database-column-id"
);

/** Pointer distance from the scrollport edge that starts edge auto-scroll. */
const AUTO_SCROLL_EDGE_PX = 48;
const AUTO_SCROLL_MAX_SPEED_PX = 12;

interface DatabaseColumnDndProps {
  children: ReactNode;
  databaseId: string;
  /** Display-order render metadata (pinned prefix first). */
  gridColumns: readonly GridColumn[];
  /** The `role="grid"` element — scopes rect collection to this grid instance. */
  gridRef: RefObject<HTMLDivElement | null>;
  view: DatabaseView;
}

/**
 * Drag surface for one grid's column reorder. A drop writes the full
 * display-order id list to `view.config.columnOrder` and re-derives
 * `pinnedFieldIds` from the freeze boundary (see {@link planColumnReorder}
 * for the pin-boundary rule).
 */
export function DatabaseColumnDnd({
  children,
  databaseId,
  gridColumns,
  gridRef,
  view,
}: DatabaseColumnDndProps) {
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  // Latest columns/view in refs so drop resolution never closes over stale
  // geometry or config (widths can change mid-session).
  const columnsRef = useRef(gridColumns);
  columnsRef.current = gridColumns;
  const viewRef = useRef(view);
  viewRef.current = view;

  const config = useMemo<DndSurfaceConfig<ColumnDropSpot>>(
    () => ({
      channel: databaseColumnChannel,
      rowAttribute: DATABASE_COLUMN_DRAG_ATTRIBUTE,
      // Scope rect collection to this grid so linked views of the same
      // database on one page never cross-talk.
      collectDropRects: () => {
        const map = new Map<string, DOMRect>();
        const root = gridRef.current;
        if (!root) {
          return map;
        }
        for (const element of root.querySelectorAll(
          `[${DATABASE_COLUMN_DRAG_ATTRIBUTE}]`
        )) {
          const id = element.getAttribute(DATABASE_COLUMN_DRAG_ATTRIBUTE);
          if (id) {
            map.set(id, element.getBoundingClientRect());
          }
        }
        return map;
      },
      resolveDropTarget: ({ pointer, rects }) => {
        const zones: ColumnDropZoneRect[] = [];
        for (const column of columnsRef.current) {
          const rect = rects.get(column.field.id);
          if (rect) {
            zones.push({
              fieldId: column.field.id,
              left: rect.left,
              right: rect.right,
              pinned: column.pinned,
            });
          }
        }
        return resolveColumnDropSpot(zones, pointer.x);
      },
      onDrop: ({ sourceId, target }) => {
        const columns = columnsRef.current;
        const currentView = viewRef.current;
        const plan = planColumnReorder({
          displayFieldIds: columns.map((column) => column.field.id),
          pinnedCount: columns.filter((column) => column.pinned).length,
          sourceFieldId: sourceId,
          targetFieldId: target.fieldId,
          edge: target.edge,
        });
        if (!plan) {
          return;
        }
        updateDatabaseView(databaseId, currentView.id, {
          config: {
            ...currentView.config,
            columnOrder: plan.columnOrder,
            pinnedFieldIds:
              plan.pinnedFieldIds.length > 0 ? plan.pinnedFieldIds : undefined,
          },
        });
      },
      dragImage: { kind: "overlay" },
      onDragStart: ({ sourceId }) => {
        setDragFieldId(sourceId);
      },
      onDragEnd: () => {
        setDragFieldId(null);
      },
    }),
    [databaseId, gridRef]
  );

  const dragColumn = dragFieldId
    ? (gridColumns.find((column) => column.field.id === dragFieldId) ?? null)
    : null;

  return (
    <DndSurface config={config}>
      <DragOverlay>
        {({ pointer }) =>
          dragColumn ? (
            <DatabaseColumnDragPreview column={dragColumn} pointer={pointer} />
          ) : null
        }
      </DragOverlay>
      {children}
    </DndSurface>
  );
}

/** Header-chip drag preview: the dragged column's icon + name under the pointer. */
function DatabaseColumnDragPreview({
  column,
  pointer,
}: {
  column: GridColumn;
  pointer: { x: number; y: number };
}) {
  const Icon = resolveFieldIcon(column.field);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0"
      style={{
        transform: `translate3d(${pointer.x}px, ${pointer.y}px, 0)`,
        width: column.width,
      }}
    >
      <div className="flex h-9 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-background px-2 text-muted-foreground opacity-90 shadow-md">
        <Icon className="size-4 shrink-0 stroke-[1.5px]" />
        <span className="truncate text-sm">{column.field.name}</span>
      </div>
    </div>
  );
}

/** Drop-accepting container for the grid (the surface's one drop zone). */
export function DatabaseColumnDropZone({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { getDropZoneProps } = useDropZone();
  const isDragging = useDragState((state) => state.draggingId != null);

  return (
    <div
      className={cn(className, isDragging && "cursor-grabbing")}
      {...getDropZoneProps()}
    >
      {children}
    </div>
  );
}

/**
 * Full-grid-height `bg-selection-primary` drop line at the candidate column
 * boundary. Rendered inside the `role="grid"` element (absolute against its
 * full content height, above the sticky header/pinned cells) and measured
 * from the live header rect so it tracks sticky pinned columns and mid-drag
 * horizontal scrolling.
 */
export function DatabaseColumnDropIndicator({
  gridRef,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
}) {
  const target = useDropTarget<ColumnDropSpot, ColumnDropSpot | null>(
    (dropTarget) => dropTarget
  );
  const [boundaryX, setBoundaryX] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!target) {
      setBoundaryX(null);
      return;
    }

    const measure = () => {
      const grid = gridRef.current;
      const header = grid?.querySelector(
        `[${DATABASE_COLUMN_DRAG_ATTRIBUTE}="${CSS.escape(target.fieldId)}"]`
      );
      if (!(grid && header instanceof HTMLElement)) {
        setBoundaryX(null);
        return;
      }
      const gridRect = grid.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const edgeX =
        target.edge === "before" ? headerRect.left : headerRect.right;
      setBoundaryX(edgeX - gridRect.left);
    };

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [target, gridRef]);

  if (boundaryX == null) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 bottom-0 z-30 w-1 -translate-x-1/2 bg-selection-primary"
      style={{ left: boundaryX }}
    />
  );
}

/**
 * Horizontal edge auto-scroll while a column drag is active. The shared
 * surface only auto-scrolls vertical ancestors on the pointer (touch) path,
 * and native drag auto-scroll over scroll containers is browser-dependent —
 * this keeps off-screen columns reachable in both modes by driving the
 * grid's own scrollport and nudging the surface to re-resolve.
 */
export function DatabaseColumnDragAutoScroll({
  scrollRef,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const ctx = useContext(DndContext);
  const isDragging = useDragState((state) => state.draggingId != null);

  useEffect(() => {
    if (!(ctx && isDragging)) {
      return;
    }
    let frame = requestAnimationFrame(function run() {
      frame = requestAnimationFrame(run);
      const element = scrollRef.current;
      const pointer = ctx.store.getSnapshot().pointer;
      if (!(element && pointer)) {
        return;
      }
      const rect = element.getBoundingClientRect();
      let speed = 0;
      if (pointer.x < rect.left + AUTO_SCROLL_EDGE_PX) {
        const intrusion = rect.left + AUTO_SCROLL_EDGE_PX - pointer.x;
        speed = -Math.min(AUTO_SCROLL_MAX_SPEED_PX, intrusion / 4);
      } else if (pointer.x > rect.right - AUTO_SCROLL_EDGE_PX) {
        const intrusion = pointer.x - (rect.right - AUTO_SCROLL_EDGE_PX);
        speed = Math.min(AUTO_SCROLL_MAX_SPEED_PX, intrusion / 4);
      }
      if (speed !== 0) {
        const before = element.scrollLeft;
        element.scrollLeft += speed;
        if (element.scrollLeft !== before) {
          // Re-resolve against the shifted rects (the surface's window scroll
          // listener refreshes them; this schedules the resolve pass).
          ctx.movePointer(pointer);
        }
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [ctx, isDragging, scrollRef]);

  return null;
}
