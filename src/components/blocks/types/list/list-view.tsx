import type { ReactNode } from "react";

import { ContainerChildren } from "@/components/blocks/container-children.tsx";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { blockIndentStyle, getBlockIndent } from "@/lib/blocks/block-indent.ts";
import {
  listItemSpacingClass,
  listMarkerCellClassName,
  listShellSpacingClass,
} from "@/lib/blocks/block-spacing.ts";
import type { BlockMode } from "@/lib/canvas/block-spec.types.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";
import { cn } from "@/lib/utils.ts";

interface ListShellProps {
  children: ReactNode;
  variant: "bullet" | "ordered";
}

export function ListShell({ children, variant }: ListShellProps) {
  const Tag = variant === "ordered" ? "ol" : "ul";
  return (
    <Tag
      className={cn("list-none text-muted-foreground", listShellSpacingClass)}
    >
      {children}
    </Tag>
  );
}

interface ListMarkerProps {
  index: number;
  variant: "bullet" | "ordered";
}

function ListMarker({ index, variant }: ListMarkerProps) {
  if (variant === "ordered") {
    return (
      <span
        aria-hidden
        className={cn(
          listMarkerCellClassName,
          "min-w-4 select-none tabular-nums leading-none"
        )}
      >
        {index + 1}.
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(listMarkerCellClassName, "select-none leading-none")}
    >
      •
    </span>
  );
}

interface ListItemShellProps {
  children: ReactNode;
  indent: number;
}

export function ListItemShell({ children, indent }: ListItemShellProps) {
  return (
    <li
      className={cn("list-none", listItemSpacingClass)}
      style={blockIndentStyle(indent)}
    >
      {children}
    </li>
  );
}

interface ListViewProps {
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

export function ListView({
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
}: ListViewProps) {
  const variant =
    row.effectiveBlock.type === "list"
      ? row.effectiveBlock.props.variant
      : "bullet";

  return (
    <ListShell variant={variant}>
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
        renderBeforeContent={(_child, index) => (
          <ListMarker index={index} variant={variant} />
        )}
        renderItem={({ child, children }) => (
          <ListItemShell
            indent={getBlockIndent(child.effectiveBlock)}
            key={child.rowId}
          >
            {children}
          </ListItemShell>
        )}
        row={row}
        slashCaret={slashCaret}
        slashMenuOpen={slashMenuOpen}
        slashPhase={slashPhase}
      />
    </ListShell>
  );
}
