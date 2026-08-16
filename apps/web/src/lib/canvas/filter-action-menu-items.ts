import type { ReactNode } from "react";

import type { CommandId } from "@/lib/settings/keyboard-commands.ts";

export interface ActionMenuEntry {
  /** Registered command whose live binding renders as a trailing shortcut. */
  command?: CommandId;
  destructive?: boolean;
  icon?: ReactNode;
  id: string;
  /** Ad-hoc combo (e.g. "Delete") when no registered command should be shown. */
  keys?: string;
  keywords?: string[];
  label: string;
  onSelect: () => void;
}

export function matchesActionMenuQuery(
  label: string,
  query: string,
  keywords: string[] = []
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [label, ...keywords].map((entry) => entry.toLowerCase());
  return haystack.some((entry) => entry.includes(normalized));
}

export function filterActionMenuItems(
  items: ActionMenuEntry[],
  query: string
): ActionMenuEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }

  return items.filter((item) =>
    matchesActionMenuQuery(item.label, query, item.keywords)
  );
}
