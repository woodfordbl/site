import type { ReactNode } from "react";

import { ContainerChildren } from "@/components/blocks/container-children.tsx";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { blockIndentStyle, getBlockIndent } from "@/lib/blocks/block-indent.ts";
import {
  listItemSpacingClass,
  listShellSpacingClass,
} from "@/lib/blocks/block-spacing.ts";
import type { BlockMode } from "@/lib/canvas/block-spec.types.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";
import { cn } from "@/lib/utils.ts";

interface ChecklistShellProps {
  children: ReactNode;
}

function ChecklistShell({ children }: ChecklistShellProps) {
  return (
    <ul
      className={cn("list-none text-muted-foreground", listShellSpacingClass)}
    >
      {children}
    </ul>
  );
}

interface ChecklistItemShellProps {
  children: ReactNode;
  indent: number;
}

function ChecklistItemShell({ children, indent }: ChecklistItemShellProps) {
  return (
    <li
      className={cn("list-none", listItemSpacingClass)}
      style={blockIndentStyle(indent)}
    >
      {children}
    </li>
  );
}

interface ChecklistItemMarkerProps {
  child: CanvasRow;
  mode: BlockMode;
}

function ChecklistItemMarker({ child, mode }: ChecklistItemMarkerProps) {
  const { dispatch } = useCanvasEditorContext();
  const block = child.effectiveBlock;
  if (block.type !== "checklistItem") {
    return null;
  }

  const props = block.props;

  if (mode === "view") {
    return (
      <Checkbox
        aria-hidden
        checked={props.checked}
        className="mt-1.5"
        disabled
        tabIndex={-1}
      />
    );
  }

  return (
    <Checkbox
      aria-label={props.checked ? "Mark unchecked" : "Mark checked"}
      checked={props.checked}
      className="mt-1.5"
      onCheckedChange={(checked) => {
        dispatch({
          type: "row.update",
          rowId: child.rowId,
          block: {
            ...block,
            props: { ...props, checked: checked === true },
          },
        });
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
    />
  );
}

interface ChecklistViewProps {
  fieldRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  mode: BlockMode;
  onSlash?: (
    query: string,
    caret: FieldSelection,
    convertRowId?: string
  ) => void;
  onSlashClose?: () => void;
  onSlashDismiss?: () => void;
  onSlashLinkBack?: () => void;
  onSlashMenuConfirm?: () => void;
  onSlashMenuNavigate?: (direction: "up" | "down") => void;
  row: CanvasRow;
  slashCaret?: FieldSelection;
  slashMenuOpen?: boolean;
  slashPhase?: "root" | "link";
}

export function ChecklistView({
  row,
  mode,
  fieldRef,
  onSlash,
  onSlashClose,
  onSlashDismiss,
  onSlashLinkBack,
  onSlashMenuConfirm,
  onSlashMenuNavigate,
  slashCaret,
  slashMenuOpen,
  slashPhase,
}: ChecklistViewProps) {
  return (
    <ChecklistShell>
      <ContainerChildren
        contentClassName="flex items-start gap-2"
        fieldRef={fieldRef}
        hoverGroup="list-item-row"
        mode={mode}
        onSlash={onSlash}
        onSlashClose={onSlashClose}
        onSlashDismiss={onSlashDismiss}
        onSlashLinkBack={onSlashLinkBack}
        onSlashMenuConfirm={onSlashMenuConfirm}
        onSlashMenuNavigate={onSlashMenuNavigate}
        renderBeforeContent={(child) => (
          <ChecklistItemMarker child={child} mode={mode} />
        )}
        renderItem={({ child, children }) => (
          <ChecklistItemShell
            indent={getBlockIndent(child.effectiveBlock)}
            key={child.rowId}
          >
            {children}
          </ChecklistItemShell>
        )}
        row={row}
        slashCaret={slashCaret}
        slashMenuOpen={slashMenuOpen}
        slashPhase={slashPhase}
      />
    </ChecklistShell>
  );
}
