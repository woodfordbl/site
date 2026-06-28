import {
  IconArrowLeft,
  IconArrowRight,
  IconLayoutNavbar,
  IconPlus,
  IconRuler2,
  IconTrash,
} from "@tabler/icons-react";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { MAX_TABS_COUNT } from "@/lib/canvas/tabs-layout.ts";
import type { TabsSize, TabsVariant } from "@/lib/schemas/block-props.ts";

import { tabIcon } from "./tab-labels.ts";

const SIZE_OPTIONS: { label: string; value: TabsSize }[] = [
  { label: "Small", value: "sm" },
  { label: "Medium", value: "md" },
  { label: "Large", value: "lg" },
];

const VARIANT_OPTIONS: { label: string; value: TabsVariant }[] = [
  { label: "Pill", value: "indicator" },
  { label: "Solid", value: "default" },
  { label: "Underline", value: "line" },
];

interface TabContextMenuProps {
  /** The tab trigger element this menu attaches to (right-click / long-press). */
  children: ReactNode;
  /** The enclosing `tabs` container row (for appearance + tab count). */
  containerRow: CanvasRow;
  isFirst: boolean;
  isLast: boolean;
  size: TabsSize;
  /** This tab's row. */
  tabRow: CanvasRow;
  variant: TabsVariant;
}

/**
 * Right-click (or long-press) editing for a single tab: rename, icon, reorder,
 * delete, plus the shared tab-bar appearance controls (size + style). This
 * replaces the old settings cog with an in-place "hold to open" gesture.
 */
export function TabContextMenu({
  containerRow,
  tabRow,
  isFirst,
  isLast,
  size,
  variant,
  children,
}: TabContextMenuProps) {
  const { dispatch } = useCanvasEditorContext();
  const tabCount = containerRow.children.length;
  const canDelete = tabCount > 1;
  const tabBlock = tabRow.effectiveBlock;
  // Raw stored label (may be empty) — not the "Tab N" display fallback, so the
  // input can be cleared without snapping back to a placeholder name.
  const storedLabel = tabBlock.type === "tab" ? tabBlock.props.label : "";
  const icon = tabIcon(tabRow);
  const [draft, setDraft] = useState(storedLabel);

  // Re-sync when the stored label changes elsewhere (reorder, reopen, undo).
  useEffect(() => {
    setDraft(storedLabel);
  }, [storedLabel]);

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

  const updateTabsProps = (patch: {
    size?: TabsSize;
    variant?: TabsVariant;
  }) => {
    const block = containerRow.effectiveBlock;
    if (block.type !== "tabs") {
      return;
    }
    dispatch({
      type: "row.update",
      rowId: containerRow.rowId,
      block: { ...block, props: { ...block.props, ...patch } },
    });
  };

  // Push every keystroke straight to the block so the tab bar renders the new
  // name in real time as it's typed.
  const handleNameChange = (value: string) => {
    setDraft(value);
    updateTabProps({ label: value });
  };

  // On blur, trim surrounding whitespace so a stray space doesn't persist.
  const commitName = () => {
    const trimmed = draft.trim();
    if (trimmed !== draft) {
      setDraft(trimmed);
      updateTabProps({ label: trimmed });
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
    <ContextMenu>
      <ContextMenuTrigger render={children as never} />
      <ContextMenuContent className="min-w-60">
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
            onChange={(event) => handleNameChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tab name"
            value={draft}
          />
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={isFirst}
          onClick={() =>
            dispatch({
              type: "tabs.moveTab",
              tabRowId: tabRow.rowId,
              direction: "prev",
            })
          }
        >
          <IconArrowLeft />
          Move left
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isLast}
          onClick={() =>
            dispatch({
              type: "tabs.moveTab",
              tabRowId: tabRow.rowId,
              direction: "next",
            })
          }
        >
          <IconArrowRight />
          Move right
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <IconRuler2 />
            Tab size
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              onValueChange={(value) =>
                updateTabsProps({ size: value as TabsSize })
              }
              value={size}
            >
              {SIZE_OPTIONS.map((option) => (
                <ContextMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <IconLayoutNavbar />
            Tab style
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              onValueChange={(value) =>
                updateTabsProps({ variant: value as TabsVariant })
              }
              value={variant}
            >
              {VARIANT_OPTIONS.map((option) => (
                <ContextMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        {tabCount < MAX_TABS_COUNT ? (
          <ContextMenuItem
            onClick={() =>
              dispatch({ type: "tabs.addTab", tabsRowId: containerRow.rowId })
            }
          >
            <IconPlus />
            Add tab
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          disabled={!canDelete}
          onClick={() =>
            dispatch({ type: "tabs.removeTab", tabRowId: tabRow.rowId })
          }
          variant="destructive"
        >
          <IconTrash />
          Delete tab
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
