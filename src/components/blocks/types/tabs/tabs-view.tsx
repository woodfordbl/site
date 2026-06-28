import { IconPlus } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";
import { MAX_TABS_COUNT } from "@/lib/canvas/tabs-layout.ts";
import type { TabsSize, TabsVariant } from "@/lib/schemas/block-props.ts";

import { TabContextMenu } from "./tab-context-menu.tsx";
import { tabIcon, tabLabel } from "./tab-labels.ts";
import { TabView } from "./tab-view.tsx";

/** Tab trigger contents: an optional leading glyph followed by the label. */
function TabTriggerLabel({
  index,
  tabRow,
}: {
  index: number;
  tabRow: CanvasRow;
}) {
  const icon = tabIcon(tabRow);
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon ? (
        // `text-current` overrides PageIconDisplay's muted default so the glyph
        // tracks the trigger's color (active/hover/inactive) like the label.
        <PageIconDisplay className="size-3.5 text-current" icon={icon} />
      ) : null}
      {tabLabel(tabRow, index)}
    </span>
  );
}

function resolveDefaultTabId(row: CanvasRow, tabRows: CanvasRow[]): string {
  const block = row.effectiveBlock;
  const persisted =
    block.type === "tabs" ? block.props.defaultTabId : undefined;
  if (persisted && tabRows.some((tabRow) => tabRow.rowId === persisted)) {
    return persisted;
  }
  return tabRows[0]?.rowId ?? "";
}

/** Tab-bar size + style, falling back to the component defaults. */
function resolveTabsAppearance(row: CanvasRow): {
  size: TabsSize;
  variant: TabsVariant;
} {
  const block = row.effectiveBlock;
  if (block.type === "tabs") {
    return {
      size: block.props.size ?? "md",
      variant: block.props.variant ?? "indicator",
    };
  }
  return { size: "md", variant: "indicator" };
}

export function TabsView({ row, mode }: BlockContainerProps) {
  if (mode === "view") {
    return <TabsReadView row={row} />;
  }
  return <TabsEditView row={row} />;
}

function TabsReadView({ row }: { row: CanvasRow }) {
  const tabRows = row.children;
  const defaultValue = resolveDefaultTabId(row, tabRows);
  const { size, variant } = resolveTabsAppearance(row);

  return (
    <Tabs className="w-full gap-3" defaultValue={defaultValue}>
      <TabsList
        className="max-w-full overflow-x-auto"
        size={size}
        variant={variant}
      >
        {tabRows.map((tabRow, index) => (
          <TabsTrigger key={tabRow.rowId} value={tabRow.rowId}>
            <TabTriggerLabel index={index} tabRow={tabRow} />
          </TabsTrigger>
        ))}
      </TabsList>
      {tabRows.map((tabRow) => (
        <TabsContent key={tabRow.rowId} value={tabRow.rowId}>
          <TabView mode="view" tabRow={tabRow} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TabsEditView({ row }: { row: CanvasRow }) {
  const { dispatch } = useCanvasEditorContext();
  const tabRows = row.children;
  const [activeId, setActiveId] = useState(() =>
    resolveDefaultTabId(row, tabRows)
  );
  // After "+" adds a tab, activate the newly appended (last) tab.
  const activateLastRef = useRef(false);

  useEffect(() => {
    if (activateLastRef.current) {
      const lastTab = tabRows.at(-1);
      if (lastTab) {
        setActiveId(lastTab.rowId);
      }
      activateLastRef.current = false;
      return;
    }
    if (!tabRows.some((tabRow) => tabRow.rowId === activeId)) {
      setActiveId(tabRows[0]?.rowId ?? "");
    }
  }, [tabRows, activeId]);

  const persistDefaultTab = useCallback(
    (nextId: string) => {
      const block = row.effectiveBlock;
      if (block.type !== "tabs" || block.props.defaultTabId === nextId) {
        return;
      }
      dispatch({
        type: "row.update",
        rowId: row.rowId,
        block: { ...block, props: { ...block.props, defaultTabId: nextId } },
      });
    },
    [dispatch, row]
  );

  const handleValueChange = useCallback(
    (value: unknown) => {
      const nextId = String(value);
      setActiveId(nextId);
      persistDefaultTab(nextId);
    },
    [persistDefaultTab]
  );

  const addTab = useCallback(() => {
    activateLastRef.current = true;
    dispatch({ type: "tabs.addTab", tabsRowId: row.rowId });
  }, [dispatch, row.rowId]);

  const { size, variant } = resolveTabsAppearance(row);

  return (
    <Tabs
      className="w-full gap-3"
      onValueChange={handleValueChange}
      value={activeId}
    >
      <div className="flex items-center gap-1" data-reveal-group>
        <TabsList
          className="max-w-full overflow-x-auto"
          size={size}
          variant={variant}
        >
          {tabRows.map((tabRow, index) => (
            <TabContextMenu
              containerRow={row}
              isFirst={index === 0}
              isLast={index === tabRows.length - 1}
              key={tabRow.rowId}
              size={size}
              tabRow={tabRow}
              variant={variant}
            >
              <TabsTrigger value={tabRow.rowId}>
                <TabTriggerLabel index={index} tabRow={tabRow} />
              </TabsTrigger>
            </TabContextMenu>
          ))}
        </TabsList>
        {tabRows.length < MAX_TABS_COUNT ? (
          <Button
            aria-label="Add tab"
            className="hover-reveal shrink-0 text-muted-foreground focus-visible:opacity-100"
            onClick={addTab}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <IconPlus className="size-4" />
          </Button>
        ) : null}
      </div>
      {tabRows.map((tabRow) => (
        <TabsContent key={tabRow.rowId} value={tabRow.rowId}>
          <TabView mode="edit" tabRow={tabRow} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
