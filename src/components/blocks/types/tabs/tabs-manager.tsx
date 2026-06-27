import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { type KeyboardEvent, useEffect, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { CanvasCommand } from "@/lib/canvas/commands.ts";
import { MAX_TABS_COUNT } from "@/lib/canvas/tabs-layout.ts";

import { tabIcon, tabLabel } from "./tab-labels.ts";

interface TabsManagerProps {
  row: CanvasRow;
}

/** A single discoverable entry point (cog) to rename, icon, reorder, and delete every tab. */
export function TabsManager({ row }: TabsManagerProps) {
  const { dispatch } = useCanvasEditorContext();
  const tabRows = row.children;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
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
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>Manage tabs</DropdownMenuLabel>
        {tabRows.map((tabRow, index) => (
          <TabSubmenu
            canDelete={tabRows.length > 1}
            dispatch={dispatch}
            index={index}
            isFirst={index === 0}
            isLast={index === tabRows.length - 1}
            key={tabRow.rowId}
            tabRow={tabRow}
          />
        ))}
        {tabRows.length < MAX_TABS_COUNT ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              closeOnClick={false}
              onClick={() =>
                dispatch({ type: "tabs.addTab", tabsRowId: row.rowId })
              }
            >
              <IconPlus />
              Add tab
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TabSubmenuProps {
  canDelete: boolean;
  dispatch: (command: CanvasCommand) => void;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  tabRow: CanvasRow;
}

function TabSubmenu({
  canDelete,
  dispatch,
  index,
  isFirst,
  isLast,
  tabRow,
}: TabSubmenuProps) {
  const label = tabLabel(tabRow, index);
  const icon = tabIcon(tabRow);
  const [draft, setDraft] = useState(label);

  // Re-sync when the committed label changes (rename, reorder, reopen).
  useEffect(() => {
    setDraft(label);
  }, [label]);

  const updateTabProps = (patch: { icon?: string; label?: string }) => {
    const block = tabRow.effectiveBlock;
    if (block.type !== "tab") {
      return;
    }
    dispatch({
      type: "row.update",
      rowId: tabRow.rowId,
      block: { ...block, props: { ...block.props, ...patch } },
    });
  };

  const commitName = () => {
    const next = draft.trim();
    if (next.length > 0 && next !== label) {
      updateTabProps({ label: next });
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Keep menu typeahead from stealing keystrokes while editing the name.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commitName();
    }
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {icon ? <PageIconDisplay icon={icon} /> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-60">
        <div className="flex items-center gap-2 p-1 pb-2">
          <GlyphIconPicker
            ariaLabel="Change tab icon"
            icon={icon}
            onRemove={() => updateTabProps({ icon: undefined })}
            onSelect={(nextIcon) => updateTabProps({ icon: nextIcon })}
            triggerButtonSize="icon-sm"
          />
          <Input
            aria-label="Tab name"
            autoComplete="off"
            onBlur={commitName}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tab name"
            value={draft}
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          closeOnClick={false}
          disabled={isFirst}
          onClick={() =>
            dispatch({
              type: "tabs.moveTab",
              tabRowId: tabRow.rowId,
              direction: "prev",
            })
          }
        >
          <IconArrowUp />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          closeOnClick={false}
          disabled={isLast}
          onClick={() =>
            dispatch({
              type: "tabs.moveTab",
              tabRowId: tabRow.rowId,
              direction: "next",
            })
          }
        >
          <IconArrowDown />
          Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!canDelete}
          onClick={() =>
            dispatch({ type: "tabs.removeTab", tabRowId: tabRow.rowId })
          }
          variant="destructive"
        >
          <IconTrash />
          Delete tab
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
