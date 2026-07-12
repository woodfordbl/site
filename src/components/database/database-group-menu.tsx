import {
  IconChevronDown,
  IconChevronRight,
  IconChevronsDown,
  IconChevronsRight,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import type { DatabaseRowGroup } from "@/lib/databases/row-group.ts";

export interface DatabaseGroupMenuProps {
  /** The group header row element (becomes the context-menu trigger). */
  children: ReactNode;
  collapsed: boolean;
  group: DatabaseRowGroup;
  /** Buckets hidden via `config.hiddenGroupKeys` — powers the unhide item. */
  hiddenGroupCount: number;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onHideGroup: (groupKey: string) => void;
  onShowHiddenGroups: () => void;
  /** The header's collapse toggle (shared with the full-row click). */
  onToggle: (groupKey: string) => void;
}

/**
 * Right-click menu for a grouped table/list header row (edit mode only):
 * collapse/expand this group or all groups, hide the group from the view
 * (`config.hiddenGroupKeys`), and bring hidden groups back. Mirrors the
 * board column ⋯ menu's display controls for grouped grids.
 */
export function DatabaseGroupMenu({
  children,
  collapsed,
  group,
  hiddenGroupCount,
  onCollapseAll,
  onExpandAll,
  onHideGroup,
  onShowHiddenGroups,
  onToggle,
}: DatabaseGroupMenuProps): ReactNode {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children as never} />
      <ContextMenuContent className="w-56">
        <ContextMenuGroup>
          <ContextMenuLabel className="max-w-full truncate">
            {group.label}
          </ContextMenuLabel>
          <ContextMenuItem
            onClick={() => {
              onToggle(group.key);
            }}
          >
            {collapsed ? <IconChevronDown /> : <IconChevronRight />}
            {collapsed ? "Expand group" : "Collapse group"}
          </ContextMenuItem>
          <ContextMenuItem onClick={onCollapseAll}>
            <IconChevronsRight />
            Collapse all groups
          </ContextMenuItem>
          <ContextMenuItem onClick={onExpandAll}>
            <IconChevronsDown />
            Expand all groups
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              onHideGroup(group.key);
            }}
          >
            <IconEyeOff />
            Hide group
          </ContextMenuItem>
          {hiddenGroupCount > 0 ? (
            <ContextMenuItem onClick={onShowHiddenGroups}>
              <IconEye />
              Show {hiddenGroupCount} hidden{" "}
              {hiddenGroupCount === 1 ? "group" : "groups"}
            </ContextMenuItem>
          ) : null}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
