"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { IconSearch } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  type ReactNode,
  type RefObject,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { buttonVariants } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { useMenuPresentation } from "@/components/ui/menu-presentation.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { TooltipContent, TooltipProvider } from "@/components/ui/tooltip.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { cn } from "@/lib/utils.ts";

type RowVirtualizer = ReturnType<
  typeof useVirtualizer<HTMLDivElement, Element>
>;

const DEFAULT_COLUMNS = 8;
const DEFAULT_ROW_HEIGHT = 38;
const DEFAULT_OVERSCAN = 6;
/** Shared floor for the empty state and short filtered result sets. */
const GRID_VIEWPORT_MIN_HEIGHT_PX = 120;
const GRID_VIEWPORT_MAX_HEIGHT_PX = 320;
const GRID_VIEWPORT_MIN_HEIGHT_CLASS = "min-h-[120px]";

function resolveGridViewportHeight(contentHeight: number): number {
  return Math.min(
    GRID_VIEWPORT_MAX_HEIGHT_PX,
    Math.max(GRID_VIEWPORT_MIN_HEIGHT_PX, contentHeight)
  );
}
/** Wait before a cell tooltip first appears. */
const TOOLTIP_OPEN_DELAY_MS = 600;
/** Grouping window for instant switching; 0 makes each new cell re-incur the open delay. */
const TOOLTIP_SWITCH_TIMEOUT_MS = 0;

interface GridPickerProps<T> {
  className?: string;
  columns?: number;
  emptyMessage: string;
  /** Accessible label for each cell. */
  getItemLabel: (item: T) => string;
  getKey: (item: T) => string;
  /** String matched against the search query (label + keywords). */
  getSearchValue: (item: T) => string;
  items: readonly T[];
  onSelect: (item: T) => void;
  /** Extra rows rendered above/below the viewport. Raise for cheap cells to smooth fast scrolling. */
  overscan?: number;
  renderItem: (item: T) => ReactNode;
  rowHeight?: number;
  searchAriaLabel: string;
  searchPlaceholder: string;
}

/**
 * Composable virtualized grid picker built on Base UI `Autocomplete` (filtering + keyboard grid
 * navigation), `@tanstack/react-virtual` (row windowing), and our input group / `Button` design system.
 * Shared by the emoji and icon panels.
 */
export function GridPicker<T>({
  items,
  getKey,
  getSearchValue,
  getItemLabel,
  renderItem,
  onSelect,
  searchPlaceholder,
  searchAriaLabel,
  emptyMessage,
  columns = DEFAULT_COLUMNS,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  className,
}: GridPickerProps<T>) {
  const [query, setQuery] = useState("");
  const virtualizerRef = useRef<RowVirtualizer | null>(null);
  // In drawer presentation (touch) the picker gets a tall surface, so grow to
  // fill it instead of capping the viewport at GRID_VIEWPORT_MAX_HEIGHT_PX.
  const fillHeight = useMenuPresentation().presentation === "drawer";

  return (
    <TooltipProvider
      delay={TOOLTIP_OPEN_DELAY_MS}
      timeout={TOOLTIP_SWITCH_TIMEOUT_MS}
    >
      <Autocomplete.Root
        autoHighlight
        grid
        inline
        items={items}
        itemToStringValue={getSearchValue}
        onItemHighlighted={(_item, { index, reason }) => {
          const virtualizer = virtualizerRef.current;
          if (!virtualizer || index < 0) {
            return;
          }
          if (reason === "keyboard" || reason === "none") {
            virtualizer.scrollToIndex(Math.floor(index / columns));
          }
        }}
        onValueChange={(value, details) => {
          if (details.reason !== "item-press") {
            setQuery(value);
          }
        }}
        value={query}
        virtualized
      >
        <div
          className={cn(
            "flex w-full min-w-0 flex-col",
            fillHeight && "min-h-0 flex-1",
            className
          )}
        >
          <InputGroup className="mb-2 shrink-0">
            <InputGroupAddon align="inline-start">
              <InputGroupText>
                <IconSearch />
              </InputGroupText>
            </InputGroupAddon>
            <Autocomplete.Input
              placeholder={searchPlaceholder}
              render={<InputGroupInput aria-label={searchAriaLabel} />}
            />
          </InputGroup>
          <Autocomplete.List
            className={cn(
              "relative w-full",
              fillHeight ? "flex min-h-0 flex-1 flex-col" : "shrink-0",
              GRID_VIEWPORT_MIN_HEIGHT_CLASS
            )}
          >
            <Autocomplete.Empty className="flex w-full">
              <Empty
                className={cn(
                  "w-full border-0 bg-transparent p-0",
                  GRID_VIEWPORT_MIN_HEIGHT_CLASS
                )}
              >
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconSearch />
                  </EmptyMedia>
                  <EmptyDescription>{emptyMessage}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </Autocomplete.Empty>
            <VirtualGrid
              columns={columns}
              fillHeight={fillHeight}
              getItemLabel={getItemLabel}
              getKey={getKey}
              onSelect={onSelect}
              overscan={overscan}
              renderItem={renderItem}
              rowHeight={rowHeight}
              virtualizerRef={virtualizerRef}
            />
          </Autocomplete.List>
        </div>
      </Autocomplete.Root>
    </TooltipProvider>
  );
}

interface VirtualGridProps<T> {
  columns: number;
  /** Grow the scroll viewport to fill its parent instead of capping at GRID_VIEWPORT_MAX_HEIGHT_PX. */
  fillHeight: boolean;
  getItemLabel: (item: T) => string;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  overscan: number;
  renderItem: (item: T) => ReactNode;
  rowHeight: number;
  virtualizerRef: RefObject<RowVirtualizer | null>;
}

const cellClassName = cn(
  buttonVariants({ variant: "ghost", size: "icon-lg" }),
  "h-9 w-full cursor-default text-base data-highlighted:bg-muted data-highlighted:text-foreground"
);

interface GridCellProps<T> {
  handle: TooltipPrimitive.Handle<string>;
  index: number;
  item: T;
  label: string;
  onSelect: (item: T) => void;
  renderItem: (item: T) => ReactNode;
  /** Wrap the cell in a hover tooltip. Disabled on touch, where the tooltip
   *  trigger's press handling swallows the tap and blocks selection. */
  showTooltip: boolean;
}

/**
 * A single grid cell. Memoized so that scrolling only re-renders rows entering/leaving the
 * window — `item`, `index`, and `label` are stable per item, and the callbacks/handle are
 * referentially stable. Cells share one tooltip via {@link TooltipPrimitive.Handle} instead of
 * each mounting their own tooltip root + portal.
 */
function GridCellComponent<T>({
  handle,
  index,
  item,
  label,
  onSelect,
  renderItem,
  showTooltip,
}: GridCellProps<T>) {
  const cell = (
    <Autocomplete.Item
      aria-label={label}
      className={cellClassName}
      index={index}
      onClick={() => onSelect(item)}
      value={item}
    >
      {renderItem(item)}
    </Autocomplete.Item>
  );

  // On coarse pointers the tooltip trigger intercepts the tap (no hover to
  // surface it anyway), so render the bare item to keep selection working.
  if (!showTooltip) {
    return cell;
  }

  return (
    <TooltipPrimitive.Trigger handle={handle} payload={label} render={cell} />
  );
}

const GridCell = memo(GridCellComponent) as typeof GridCellComponent;

function VirtualGrid<T>({
  columns,
  fillHeight,
  rowHeight,
  overscan,
  getKey,
  getItemLabel,
  renderItem,
  onSelect,
  virtualizerRef,
}: VirtualGridProps<T>) {
  const filteredItems = Autocomplete.useFilteredItems<T>();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const showTooltip = !useIsCoarsePrimaryPointer();
  const rowCount = Math.ceil(filteredItems.length / columns);
  const tooltipHandle = useMemo(
    () => TooltipPrimitive.createHandle<string>(),
    []
  );

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  useImperativeHandle(virtualizerRef, () => virtualizer, [virtualizer]);

  const handleScrollRef = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element;
      if (element) {
        virtualizer.measure();
      }
    },
    [virtualizer]
  );

  if (filteredItems.length === 0) {
    return null;
  }

  const viewportHeight = fillHeight
    ? undefined
    : resolveGridViewportHeight(virtualizer.getTotalSize());

  return (
    <>
      <TooltipPrimitive.Root handle={tooltipHandle}>
        {({ payload }) => (
          <TooltipContent className="capitalize">{payload}</TooltipContent>
        )}
      </TooltipPrimitive.Root>
      <ScrollArea
        className={cn("w-full", fillHeight && "min-h-0 flex-1")}
        fadeEdges
        style={fillHeight ? undefined : { height: viewportHeight }}
        viewportClassName="overscroll-contain px-px"
        viewportRef={handleScrollRef}
      >
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * columns;
            const rowItems = filteredItems.slice(start, start + columns);
            return (
              <Autocomplete.Row
                className="grid gap-0.5"
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {rowItems.map((item, columnIndex) => (
                  <GridCell
                    handle={tooltipHandle}
                    index={start + columnIndex}
                    item={item}
                    key={getKey(item)}
                    label={getItemLabel(item)}
                    onSelect={onSelect}
                    renderItem={renderItem}
                    showTooltip={showTooltip}
                  />
                ))}
              </Autocomplete.Row>
            );
          })}
        </div>
      </ScrollArea>
    </>
  );
}
