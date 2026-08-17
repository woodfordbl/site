import type { ReactNode } from "react";

import { ContainerChildren } from "@/components/blocks/container-children.tsx";
import { blockIndentStyle, getBlockIndent } from "@/lib/blocks/block-indent.ts";
import {
  listItemSpacingClass,
  listMarkerCellClassName,
  listShellSpacingClass,
} from "@/lib/blocks/block-spacing.ts";
import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

interface ListShellProps {
  children: ReactNode;
  variant: "bullet" | "ordered";
}

export function ListShell({ children, variant }: ListShellProps) {
  const Tag = variant === "ordered" ? "ol" : "ul";
  return (
    <Tag className={cn("list-none", listShellSpacingClass)}>{children}</Tag>
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
          "min-w-4 select-none text-muted-foreground tabular-nums leading-none"
        )}
      >
        {index + 1}.
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        listMarkerCellClassName,
        "select-none text-muted-foreground leading-none"
      )}
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

export function ListView({ row, mode }: BlockContainerProps) {
  const variant =
    row.effectiveBlock.type === "list"
      ? row.effectiveBlock.props.variant
      : "bullet";

  return (
    <ListShell variant={variant}>
      <ContainerChildren
        contentClassName="flex items-start gap-2"
        mode={mode}
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
      />
    </ListShell>
  );
}
