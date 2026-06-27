import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconPlus,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { type KeyboardEvent, useCallback, useEffect, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { MAX_TABS_COUNT } from "@/lib/canvas/tabs-layout.ts";

import { tabIcon, tabLabel } from "./tab-labels.ts";

interface TabsManagerProps {
  row: CanvasRow;
}

/** A single discoverable entry point (cog) to rename, icon, reorder, and delete every tab. */
export function TabsManager({ row }: TabsManagerProps) {
  const { dispatch } = useCanvasEditorContext();
  const tabRows = row.children;
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reset to the list whenever the panel reopens or the selected tab disappears.
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
    }
  }, [open]);

  const selectedRow = selectedId
    ? tabRows.find((tabRow) => tabRow.rowId === selectedId)
    : undefined;
  const selectedIndex = selectedRow
    ? tabRows.findIndex((tabRow) => tabRow.rowId === selectedRow.rowId)
    : -1;

  useEffect(() => {
    if (selectedId && !selectedRow) {
      setSelectedId(null);
    }
  }, [selectedId, selectedRow]);

  const updateTabProps = useCallback(
    (tabRow: CanvasRow, patch: { icon?: string; label?: string }) => {
      const block = tabRow.effectiveBlock;
      if (block.type !== "tab") {
        return;
      }
      dispatch({
        type: "row.update",
        rowId: tabRow.rowId,
        block: { ...block, props: { ...block.props, ...patch } },
      });
    },
    [dispatch]
  );

  const moveTab = useCallback(
    (tabRowId: string, direction: "prev" | "next") => {
      dispatch({ type: "tabs.moveTab", tabRowId, direction });
    },
    [dispatch]
  );

  const addTab = useCallback(() => {
    dispatch({ type: "tabs.addTab", tabsRowId: row.rowId });
  }, [dispatch, row.rowId]);

  const deleteTab = useCallback(
    (tabRowId: string) => {
      dispatch({ type: "tabs.removeTab", tabRowId });
      setSelectedId(null);
    },
    [dispatch]
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label="Manage tabs"
            className="size-6 shrink-0 text-muted-foreground"
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <IconSettings className="size-3.5" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64">
        {selectedRow ? (
          <TabDetail
            canDelete={tabRows.length > 1}
            icon={tabIcon(selectedRow)}
            key={selectedRow.rowId}
            label={tabLabel(selectedRow, selectedIndex)}
            onBack={() => setSelectedId(null)}
            onDelete={() => deleteTab(selectedRow.rowId)}
            onIconSelect={(icon) => updateTabProps(selectedRow, { icon })}
            onRename={(label) => updateTabProps(selectedRow, { label })}
          />
        ) : (
          <TabList
            onAdd={addTab}
            onMove={moveTab}
            onSelect={setSelectedId}
            tabRows={tabRows}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

interface TabListProps {
  onAdd: () => void;
  onMove: (tabRowId: string, direction: "prev" | "next") => void;
  onSelect: (tabRowId: string) => void;
  tabRows: CanvasRow[];
}

function TabList({ onAdd, onMove, onSelect, tabRows }: TabListProps) {
  return (
    <>
      <div className="px-1 font-medium text-muted-foreground text-xs">
        Manage tabs
      </div>
      <div className="flex flex-col gap-0.5">
        {tabRows.map((tabRow, index) => {
          const icon = tabIcon(tabRow);
          return (
            <div className="flex items-center gap-0.5" key={tabRow.rowId}>
              <Button
                className="min-w-0 flex-1 justify-start gap-1.5"
                onClick={() => onSelect(tabRow.rowId)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {icon ? (
                  <PageIconDisplay className="size-3.5" icon={icon} />
                ) : null}
                <span className="truncate">{tabLabel(tabRow, index)}</span>
              </Button>
              <Button
                aria-label="Move tab earlier"
                className="size-7 shrink-0 text-muted-foreground"
                disabled={index === 0}
                onClick={() => onMove(tabRow.rowId, "prev")}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <IconChevronUp className="size-3.5" />
              </Button>
              <Button
                aria-label="Move tab later"
                className="size-7 shrink-0 text-muted-foreground"
                disabled={index === tabRows.length - 1}
                onClick={() => onMove(tabRow.rowId, "next")}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <IconChevronDown className="size-3.5" />
              </Button>
              <Button
                aria-label="Edit tab"
                className="size-7 shrink-0 text-muted-foreground"
                onClick={() => onSelect(tabRow.rowId)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <IconChevronRight className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
      {tabRows.length < MAX_TABS_COUNT ? (
        <Button
          className="justify-start"
          onClick={onAdd}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconPlus className="size-3.5" />
          Add tab
        </Button>
      ) : null}
    </>
  );
}

interface TabDetailProps {
  canDelete: boolean;
  icon?: string;
  label: string;
  onBack: () => void;
  onDelete: () => void;
  onIconSelect: (icon: string) => void;
  onRename: (label: string) => void;
}

function TabDetail({
  canDelete,
  icon,
  label,
  onBack,
  onDelete,
  onIconSelect,
  onRename,
}: TabDetailProps) {
  const [draft, setDraft] = useState(label);

  const commit = useCallback(() => {
    const next = draft.trim();
    if (next.length > 0 && next !== label) {
      onRename(next);
    }
  }, [draft, label, onRename]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    },
    [commit]
  );

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          aria-label="Back to tab list"
          className="size-6 shrink-0 text-muted-foreground"
          onClick={onBack}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <IconChevronLeft className="size-3.5" />
        </Button>
        <span className="truncate font-medium text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <GlyphIconPicker
          ariaLabel="Change tab icon"
          icon={icon}
          onSelect={onIconSelect}
          triggerButtonSize="icon-sm"
        />
        <Input
          aria-label="Tab name"
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tab name"
          value={draft}
        />
      </div>
      <Button
        className="justify-start"
        disabled={!canDelete}
        onClick={onDelete}
        size="sm"
        type="button"
        variant="ghost"
      >
        <IconTrash className="size-3.5" />
        Delete tab
      </Button>
    </>
  );
}
