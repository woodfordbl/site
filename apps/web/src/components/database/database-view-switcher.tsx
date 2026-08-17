import { IconPlus } from "@tabler/icons-react";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DATABASE_VIEW_TYPE_ICONS,
  DATABASE_VIEW_TYPE_LABELS,
  resolveViewIconDisplay,
} from "@/components/database/database-view-icons.tsx";
import { DatabaseViewMenu } from "@/components/database/database-view-menu.tsx";
import {
  DndContext,
  DndSurface,
  type DndSurfaceConfig,
} from "@/components/dnd/dnd-surface.tsx";
import { DragOverlay } from "@/components/dnd/drag-overlay.tsx";
import {
  useDragSource,
  useDragState,
  useDropTarget,
  useDropZone,
} from "@/components/dnd/use-dnd.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  addDatabaseView,
  reorderDatabaseViews,
} from "@/db/queries/database-collection-ops.ts";
import {
  planViewReorder,
  resolveViewTabDropTarget,
  type ViewTabDropSpot,
  type ViewTabDropZoneRect,
} from "@/lib/databases/view-reorder.ts";
import { createDragChannel } from "@/lib/dnd/drag-channel.ts";
import type { DatabaseView, DatabaseViewType } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

const VIEW_TYPES: DatabaseViewType[] = [
  "table",
  "list",
  "board",
  "chart",
  "map",
];

/** Attribute carrying the view id on draggable edit-mode tabs. */
export const DATABASE_VIEW_TAB_DRAG_ATTRIBUTE = "data-database-view-tab-id";

const databaseViewTabChannel = createDragChannel(
  "application/x-database-view-tab-id"
);

/** Hold before grab cursor / drag arm on fine pointers (page-list / columns). */
const VIEW_TAB_DRAG_HOLD_MS = 50;

/** Pointer distance from the scrollport edge that starts edge auto-scroll. */
const AUTO_SCROLL_EDGE_PX = 48;
const AUTO_SCROLL_MAX_SPEED_PX = 12;

interface AddDatabaseViewMenuItemsProps {
  databaseId: string;
  /** Called with the created view's id — callers activate it. */
  onCreated?: (viewId: string) => void;
}

/**
 * The four "Add view" rows (type icon + label), shared by the switcher's "+"
 * menu and the settings menu's Views submenu so both create views the same
 * way (`addDatabaseView` per-type defaults).
 */
export function AddDatabaseViewMenuItems({
  databaseId,
  onCreated,
}: AddDatabaseViewMenuItemsProps): ReactNode {
  return VIEW_TYPES.map((type) => {
    const TypeIcon = DATABASE_VIEW_TYPE_ICONS[type];
    return (
      <DropdownMenuItem
        key={type}
        onClick={() => {
          const created = addDatabaseView(databaseId, { type });
          if (created) {
            onCreated?.(created.id);
          }
        }}
      >
        <TypeIcon className="stroke-[1.5px]" />
        {DATABASE_VIEW_TYPE_LABELS[type]}
      </DropdownMenuItem>
    );
  });
}

export interface DatabaseViewSwitcherProps {
  /** The resolved active view id (always one of `views`). */
  activeViewId: string;
  databaseId: string;
  mode: "view" | "edit";
  /**
   * Activates a view. Edit mode persists it onto the hosting block
   * (`props.viewId`); view mode falls back to ephemeral local state in the
   * entry — this callback never knows the difference.
   */
  onViewIdChange: (viewId: string) => void;
  views: DatabaseView[];
}

/**
 * Tab label for one saved view. Forwards props/ref from
 * `ContextMenuTrigger render={…}` so right-click handlers land on the
 * underlying tab button (not a dead wrapper component).
 */
function ViewTabTrigger({
  className,
  view,
  ...props
}: { view: DatabaseView } & Omit<
  ComponentPropsWithoutRef<typeof TabsTrigger>,
  "value" | "children"
>): ReactNode {
  return (
    <TabsTrigger
      className={cn("flex-none shrink-0", className)}
      value={view.id}
      {...props}
    >
      {resolveViewIconDisplay(view, "stroke-[1.5px]")}
      <span className="max-w-32 truncate">{view.name}</span>
    </TabsTrigger>
  );
}

/**
 * Edit-mode tab: shared DnD source + right-click menu. Left-click still
 * activates via Tabs; a completed drag suppresses that trailing click.
 */
function EditableViewTab({
  canDelete,
  databaseId,
  onViewIdChange,
  view,
}: {
  canDelete: boolean;
  databaseId: string;
  onViewIdChange: (viewId: string) => void;
  view: DatabaseView;
}): ReactNode {
  const { getSourceProps, isDragging, showGrabbing, shouldSuppressClick } =
    useDragSource({
      id: view.id,
      holdMs: VIEW_TAB_DRAG_HOLD_MS,
      dragAxis: "x",
    });
  const sourceProps = getSourceProps();

  return (
    <DatabaseViewMenu
      canDelete={canDelete}
      databaseId={databaseId}
      onViewIdChange={onViewIdChange}
      view={view}
    >
      <ViewTabTrigger
        {...sourceProps}
        className={cn(
          "cursor-pointer",
          showGrabbing && "cursor-grabbing",
          isDragging && "opacity-50"
        )}
        data-database-view-tab-id={view.id}
        onClickCapture={(event) => {
          if (shouldSuppressClick()) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        view={view}
      />
    </DatabaseViewMenu>
  );
}

/** Full-height `bg-selection-primary` line at the candidate tab boundary. */
function ViewTabDropIndicator({
  listRef,
}: {
  listRef: RefObject<HTMLDivElement | null>;
}): ReactNode {
  const target = useDropTarget<ViewTabDropSpot, ViewTabDropSpot | null>(
    (dropTarget) => dropTarget
  );
  const [boundaryX, setBoundaryX] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!target) {
      setBoundaryX(null);
      return;
    }

    const measure = () => {
      const list = listRef.current;
      const tab = list?.querySelector(
        `[${DATABASE_VIEW_TAB_DRAG_ATTRIBUTE}="${CSS.escape(target.viewId)}"]`
      );
      if (!(list && tab instanceof HTMLElement)) {
        setBoundaryX(null);
        return;
      }
      const listRect = list.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      const edgeX = target.edge === "before" ? tabRect.left : tabRect.right;
      setBoundaryX(edgeX - listRect.left);
    };

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [target, listRef]);

  if (boundaryX == null) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-1 bottom-1 z-30 w-0.5 -translate-x-1/2 rounded-full bg-selection-primary"
      style={{ left: boundaryX }}
    />
  );
}

/**
 * Horizontal edge auto-scroll while a view-tab drag is active (the shared
 * surface only auto-scrolls vertical ancestors on the pointer path).
 */
function ViewTabDragAutoScroll({
  scrollRef,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
}): null {
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

function ViewTabDragPreview({
  pointer,
  view,
}: {
  pointer: { x: number; y: number };
  view: DatabaseView;
}): ReactNode {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0"
      style={{
        transform: `translate3d(${pointer.x}px, ${pointer.y}px, 0)`,
      }}
    >
      <div className="flex h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-md bg-muted px-1.5 text-foreground/60 text-xs opacity-50">
        {resolveViewIconDisplay(view, "stroke-[1.5px]")}
        <span className="max-w-32 truncate">{view.name}</span>
      </div>
    </div>
  );
}

function ViewTabsDropZone({
  children,
  className,
  listRef,
}: {
  children: ReactNode;
  className?: string;
  listRef: RefObject<HTMLDivElement | null>;
}): ReactNode {
  const { getDropZoneProps } = useDropZone();
  const isDragging = useDragState((state) => state.draggingId != null);

  return (
    <div
      className={cn("relative", className, isDragging && "cursor-grabbing")}
      ref={listRef}
      {...getDropZoneProps()}
    >
      {children}
      <ViewTabDropIndicator listRef={listRef} />
    </div>
  );
}

/**
 * Edit-mode tab strip with shared-toolkit DnD reorder. Persists via
 * `reorderDatabaseViews` (array order = tab order).
 */
function EditableViewTabs({
  activeViewId,
  canDelete,
  databaseId,
  onViewIdChange,
  views,
}: {
  activeViewId: string;
  canDelete: boolean;
  databaseId: string;
  onViewIdChange: (viewId: string) => void;
  views: DatabaseView[];
}): ReactNode {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [dragViewId, setDragViewId] = useState<string | null>(null);
  const viewsRef = useRef(views);
  viewsRef.current = views;

  const config = useMemo<DndSurfaceConfig<ViewTabDropSpot>>(
    () => ({
      channel: databaseViewTabChannel,
      rowAttribute: DATABASE_VIEW_TAB_DRAG_ATTRIBUTE,
      collectDropRects: () => {
        const map = new Map<string, DOMRect>();
        const root = listRef.current;
        if (!root) {
          return map;
        }
        for (const element of root.querySelectorAll(
          `[${DATABASE_VIEW_TAB_DRAG_ATTRIBUTE}]`
        )) {
          const id = element.getAttribute(DATABASE_VIEW_TAB_DRAG_ATTRIBUTE);
          if (id) {
            map.set(id, element.getBoundingClientRect());
          }
        }
        return map;
      },
      resolveDropTarget: ({ sourceId, pointer, rects }) => {
        const zones: ViewTabDropZoneRect[] = [];
        for (const view of viewsRef.current) {
          const rect = rects.get(view.id);
          if (rect) {
            zones.push({
              viewId: view.id,
              left: rect.left,
              right: rect.right,
            });
          }
        }
        // Null for the source's own boundaries so the indicator stays off.
        return resolveViewTabDropTarget(zones, pointer.x, sourceId);
      },
      onDrop: ({ sourceId, target }) => {
        const plan = planViewReorder({
          viewIds: viewsRef.current.map((view) => view.id),
          sourceViewId: sourceId,
          targetViewId: target.viewId,
          edge: target.edge,
        });
        if (!plan) {
          return;
        }
        reorderDatabaseViews(databaseId, plan);
      },
      dragImage: { kind: "overlay" },
      onDragStart: ({ sourceId }) => {
        setDragViewId(sourceId);
      },
      onDragEnd: () => {
        setDragViewId(null);
      },
    }),
    [databaseId]
  );

  const dragView = dragViewId
    ? (views.find((view) => view.id === dragViewId) ?? null)
    : null;

  return (
    <div className="no-scrollbar min-w-0 overflow-x-auto" ref={scrollRef}>
      <DndSurface config={config}>
        <DragOverlay>
          {({ pointer }) =>
            dragView ? (
              <ViewTabDragPreview pointer={pointer} view={dragView} />
            ) : null
          }
        </DragOverlay>
        <ViewTabDragAutoScroll scrollRef={scrollRef} />
        <Tabs
          onValueChange={(value) => {
            onViewIdChange(String(value));
          }}
          value={activeViewId}
        >
          <ViewTabsDropZone listRef={listRef}>
            <TabsList className="flex-nowrap" size="sm" variant="indicator">
              {views.map((view) => (
                <EditableViewTab
                  canDelete={canDelete}
                  databaseId={databaseId}
                  key={view.id}
                  onViewIdChange={onViewIdChange}
                  view={view}
                />
              ))}
            </TabsList>
          </ViewTabsDropZone>
        </Tabs>
      </DndSurface>
    </div>
  );
}

/**
 * Compact saved-view tabs in the database title row: TabsList `indicator`
 * variant, one tab per view (custom or type icon + name), horizontally
 * scrollable when the row overflows. Edit mode appends a hover-revealed "+"
 * opening the Add-view menu, wraps each tab in a right-click edit menu
 * (rename / icon / duplicate / delete), and allows drag-reorder of the
 * `views[]` array. View mode is switch-only (and hides entirely for
 * single-view — there is nothing to switch).
 */
export function DatabaseViewSwitcher({
  activeViewId,
  databaseId,
  mode,
  onViewIdChange,
  views,
}: DatabaseViewSwitcherProps): ReactNode {
  if (mode === "view" && views.length <= 1) {
    return null;
  }

  const canDelete = views.length > 1;

  return (
    <div className="flex min-w-0 items-center">
      {mode === "edit" ? (
        <EditableViewTabs
          activeViewId={activeViewId}
          canDelete={canDelete}
          databaseId={databaseId}
          onViewIdChange={onViewIdChange}
          views={views}
        />
      ) : (
        <div className="no-scrollbar min-w-0 overflow-x-auto">
          <Tabs
            onValueChange={(value) => {
              onViewIdChange(String(value));
            }}
            value={activeViewId}
          >
            <TabsList className="flex-nowrap" size="sm" variant="indicator">
              {views.map((view) => (
                <ViewTabTrigger key={view.id} view={view} />
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}
      {mode === "edit" ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            nativeButton
            render={
              <Button
                aria-label="Add view"
                className="hover-reveal shrink-0 text-muted-foreground data-popup-open:opacity-100"
                size="icon-xs"
                type="button"
                variant="ghost"
              />
            }
          >
            <IconPlus aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <AddDatabaseViewMenuItems
              databaseId={databaseId}
              onCreated={onViewIdChange}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
