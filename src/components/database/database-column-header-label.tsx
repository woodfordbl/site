import type { ComponentType } from "react";

import { cn } from "@/lib/utils.ts";

/**
 * Shared database table column header label: type/custom icon plus optional
 * truncated property name. Checkbox columns pass `compact` when resized to the
 * checkbox column minimum (icon + modest padding) so only the icon remains
 * (centered).
 */
export function DatabaseColumnHeaderLabel({
  Icon,
  compact = false,
  name,
}: {
  Icon: ComponentType<{ className?: string }>;
  compact?: boolean;
  name: string;
}) {
  return (
    <>
      <Icon className="size-4 shrink-0 stroke-[1.5px]" />
      {compact ? null : <span className="truncate text-sm">{name}</span>}
    </>
  );
}

/**
 * Trigger/content alignment for {@link DatabaseColumnHeaderLabel}.
 * Compact checkbox headers use tighter horizontal padding (`px-1`) so a
 * `size-4` icon fits cleanly inside the checkbox column minimum without
 * sitting flush against the resize edge.
 */
export function databaseColumnHeaderAlignClass(compact: boolean): string {
  return cn(
    "flex w-full min-w-0 items-center gap-1.5 overflow-hidden",
    compact ? "justify-center px-1" : "px-2"
  );
}
