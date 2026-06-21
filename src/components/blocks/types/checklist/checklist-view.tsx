import type { ReactNode } from "react";

import { ContainerChildren } from "@/components/blocks/container-children.tsx";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { blockIndentStyle, getBlockIndent } from "@/lib/blocks/block-indent.ts";
import {
  listItemSpacingClass,
  listShellSpacingClass,
} from "@/lib/blocks/block-spacing.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type {
  BlockContainerProps,
  BlockMode,
} from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

interface ChecklistShellProps {
  children: ReactNode;
}

function ChecklistShell({ children }: ChecklistShellProps) {
  return <ul className={cn("list-none", listShellSpacingClass)}>{children}</ul>;
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

export function ChecklistView({ row, mode }: BlockContainerProps) {
  return (
    <ChecklistShell>
      <ContainerChildren
        contentClassName="flex items-start gap-2"
        mode={mode}
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
      />
    </ChecklistShell>
  );
}
