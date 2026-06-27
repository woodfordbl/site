import { IconDots, IconPlus, IconTrash } from "@tabler/icons-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";
import { MAX_TABS_COUNT } from "@/lib/canvas/tabs-layout.ts";
import { cn } from "@/lib/utils.ts";

import { TabView } from "./tab-view.tsx";

function tabLabel(tabRow: CanvasRow, index: number): string {
  const block = tabRow.effectiveBlock;
  const label = block.type === "tab" ? block.props.label.trim() : "";
  return label.length > 0 ? label : `Tab ${index + 1}`;
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

export function TabsView({ row, mode }: BlockContainerProps) {
  if (mode === "view") {
    return <TabsReadView row={row} />;
  }
  return <TabsEditView row={row} />;
}

function TabsReadView({ row }: { row: CanvasRow }) {
  const tabRows = row.children;
  const defaultValue = resolveDefaultTabId(row, tabRows);

  return (
    <Tabs className="w-full gap-3" defaultValue={defaultValue}>
      <TabsList className="max-w-full overflow-x-auto">
        {tabRows.map((tabRow, index) => (
          <TabsTrigger key={tabRow.rowId} value={tabRow.rowId}>
            {tabLabel(tabRow, index)}
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

  return (
    <Tabs
      className="w-full gap-3"
      onValueChange={handleValueChange}
      value={activeId}
    >
      <div className="flex items-center gap-1">
        <TabsList className="max-w-full overflow-x-auto">
          {tabRows.map((tabRow, index) => (
            <div
              className="group/tab relative flex items-center"
              key={tabRow.rowId}
            >
              <TabsTrigger className="pr-6" value={tabRow.rowId}>
                {tabLabel(tabRow, index)}
              </TabsTrigger>
              <TabMenu
                canDelete={tabRows.length > 1}
                label={tabLabel(tabRow, index)}
                onDelete={() =>
                  dispatch({ type: "tabs.removeTab", tabRowId: tabRow.rowId })
                }
                onRename={(nextLabel) => {
                  const block = tabRow.effectiveBlock;
                  if (block.type !== "tab") {
                    return;
                  }
                  dispatch({
                    type: "row.update",
                    rowId: tabRow.rowId,
                    block: {
                      ...block,
                      props: { ...block.props, label: nextLabel },
                    },
                  });
                }}
              />
            </div>
          ))}
        </TabsList>
        {tabRows.length < MAX_TABS_COUNT ? (
          <Button
            aria-label="Add tab"
            className="size-6 shrink-0 text-muted-foreground"
            onClick={addTab}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <IconPlus className="size-3.5" />
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

interface TabMenuProps {
  canDelete: boolean;
  label: string;
  onDelete: () => void;
  onRename: (label: string) => void;
}

function TabMenu({ canDelete, label, onDelete, onRename }: TabMenuProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(label);

  useEffect(() => {
    if (open) {
      setDraft(label);
    }
  }, [open, label]);

  const commit = useCallback(() => {
    const next = draft.trim();
    if (next.length > 0 && next !== label) {
      onRename(next);
    }
    setOpen(false);
  }, [draft, label, onRename]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    },
    [commit]
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label="Tab options"
            className={cn(
              "absolute top-1/2 right-0.5 z-20 size-4 -translate-y-1/2 text-muted-foreground opacity-0",
              "group-hover/tab:opacity-100 aria-expanded:opacity-100 data-[state=open]:opacity-100"
            )}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <IconDots className="size-3.5" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56">
        <Input
          aria-label="Tab name"
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tab name"
          value={draft}
        />
        <Button
          className="justify-start"
          disabled={!canDelete}
          onClick={() => {
            setOpen(false);
            onDelete();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconTrash className="size-3.5" />
          Delete tab
        </Button>
      </PopoverContent>
    </Popover>
  );
}
