import { IconFile } from "@tabler/icons-react";
import type { ComponentType } from "react";

export const TABLER_PAGE_ICON_PREFIX = "tabler:" as const;

/** One SVG child of a Tabler icon as stored in the catalog asset: `[tag, attributes]`. */
export type TablerIconNodeElement = [string, Record<string, string | number>];
export type TablerIconNode = TablerIconNodeElement[];

/** A single entry in the shared Tabler catalog asset (`public/tabler/icons.json`). */
export interface TablerIconCatalogItem {
  filled: boolean;
  /** Kebab keyword string used for search, e.g. `arrow-left`. */
  keywords: string;
  /** PascalCase identity stored as `tabler:<name>`, e.g. `IconHome`. */
  name: string;
  node: TablerIconNode;
}

export type DecodedPageIcon =
  | { kind: "default" }
  | { kind: "emoji"; value: string }
  | { kind: "tabler"; name: string };

/**
 * Encodes a Tabler icon name for `localPagesCollection` / shipped JSON (`tabler:IconName`).
 * @see docs/architecture/pages.md#page-icons
 */
export function formatTablerPageIcon(name: string): string {
  return `${TABLER_PAGE_ICON_PREFIX}${name}`;
}

/**
 * Decodes stored page icon strings for `PageIconDisplay`. Tabler names resolve against the
 * deferred catalog at render time; unresolved names fall back to {@link DEFAULT_PAGE_ICON}.
 * @see docs/architecture/pages.md#page-icons
 */
export function decodePageIcon(raw?: string): DecodedPageIcon {
  if (raw == null || raw.length === 0) {
    return { kind: "default" };
  }

  if (raw.startsWith(TABLER_PAGE_ICON_PREFIX)) {
    const name = raw.slice(TABLER_PAGE_ICON_PREFIX.length);
    if (name.length === 0) {
      return { kind: "default" };
    }
    return { kind: "tabler", name };
  }

  return { kind: "emoji", value: raw };
}

/** Statically bundled default icon so page rows paint instantly without the deferred catalog. */
export const DEFAULT_PAGE_ICON: ComponentType<{ className?: string }> =
  IconFile;
