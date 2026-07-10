import {
  IconAlignLeft,
  IconCalendar,
  IconCircleDot,
  IconHash,
  IconLink,
  IconList,
  IconMathFunction,
  IconSquareCheck,
} from "@tabler/icons-react";
import { type ComponentType, createElement } from "react";

import { TablerGlyph } from "@/components/pages/tabler-glyph.tsx";
import {
  TABLER_PAGE_ICON_PREFIX,
  type TablerIconNode,
} from "@/lib/pages/page-icon.ts";
import { useTablerIconGlyph } from "@/lib/pages/page-icon-catalog.ts";
import type {
  DatabaseField,
  DatabaseFieldType,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Field-type icons shared by database surfaces outside the grid (filter bar,
 * pickers). The grid header keeps its own copy this wave; consolidation on
 * this map is deferred until the grid file is free to edit.
 */
export const DATABASE_FIELD_TYPE_ICONS: Record<
  DatabaseFieldType,
  ComponentType<{ className?: string }>
> = {
  text: IconAlignLeft,
  number: IconHash,
  checkbox: IconSquareCheck,
  select: IconCircleDot,
  multiSelect: IconList,
  date: IconCalendar,
  url: IconLink,
  formula: IconMathFunction,
};

/**
 * The same field-type glyphs as raw Tabler node data (path lists), for
 * surfaces that build DOM without React — the CodeMirror property-chip
 * widget renders these via `document.createElementNS`. Hand-copied from
 * `@tabler/icons-react`'s icon nodes;
 * `database-field-icons.dom.test.tsx` asserts parity with the React
 * components above so the two maps can't drift.
 */
export const DATABASE_FIELD_TYPE_ICON_NODES: Record<
  DatabaseFieldType,
  TablerIconNode
> = {
  text: [
    ["path", { d: "M4 6l16 0" }],
    ["path", { d: "M4 12l10 0" }],
    ["path", { d: "M4 18l14 0" }],
  ],
  number: [
    ["path", { d: "M5 9l14 0" }],
    ["path", { d: "M5 15l14 0" }],
    ["path", { d: "M11 4l-4 16" }],
    ["path", { d: "M17 4l-4 16" }],
  ],
  checkbox: [
    [
      "path",
      {
        d: "M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14",
      },
    ],
    ["path", { d: "M9 12l2 2l4 -4" }],
  ],
  select: [
    ["path", { d: "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" }],
    ["path", { d: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" }],
  ],
  multiSelect: [
    ["path", { d: "M9 6l11 0" }],
    ["path", { d: "M9 12l11 0" }],
    ["path", { d: "M9 18l11 0" }],
    ["path", { d: "M5 6l0 .01" }],
    ["path", { d: "M5 12l0 .01" }],
    ["path", { d: "M5 18l0 .01" }],
  ],
  date: [
    [
      "path",
      {
        d: "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12",
      },
    ],
    ["path", { d: "M16 3v4" }],
    ["path", { d: "M8 3v4" }],
    ["path", { d: "M4 11h16" }],
    ["path", { d: "M11 15h1" }],
    ["path", { d: "M12 15v3" }],
  ],
  url: [
    ["path", { d: "M9 15l6 -6" }],
    ["path", { d: "M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464" }],
    [
      "path",
      {
        d: "M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463",
      },
    ],
  ],
  formula: [
    [
      "path",
      { d: "M3 19a2 2 0 0 0 2 2c2 0 2 -4 3 -9s1 -9 3 -9a2 2 0 0 1 2 2" },
    ],
    ["path", { d: "M5 12h6" }],
    ["path", { d: "M15 12l6 6" }],
    ["path", { d: "M15 18l6 -6" }],
  ],
};

type FieldIconComponent = ComponentType<{ className?: string }>;

/**
 * Custom-icon components cached per `type + icon` so `resolveFieldIcon`
 * returns stable identities across renders (no remount churn in menus/grids).
 */
const customFieldIconCache = new Map<string, FieldIconComponent>();

/**
 * `tabler:IconName` field icons resolve through the same by-name glyph fetch
 * page icons use (no full catalog download); the field-type icon paints as a
 * fallback until the glyph arrives (or if the name is unknown).
 */
function createTablerFieldIcon(
  name: string,
  Fallback: FieldIconComponent
): FieldIconComponent {
  return function TablerFieldIcon({ className }: { className?: string }) {
    const glyph = useTablerIconGlyph(name);
    if (!glyph) {
      return createElement(Fallback, { className });
    }
    return createElement(TablerGlyph, {
      className,
      filled: glyph.filled,
      node: glyph.node,
    });
  };
}

/** Emoji field icons render the raw character sized to sit like an svg glyph. */
function createEmojiFieldIcon(value: string): FieldIconComponent {
  return function EmojiFieldIcon({ className }: { className?: string }) {
    return createElement(
      "span",
      {
        "aria-hidden": true,
        className: cn(
          "inline-flex shrink-0 select-none items-center justify-center text-sm leading-none",
          className
        ),
      },
      value
    );
  };
}

/**
 * Icon component for a field, honoring its optional custom glyph:
 * `tabler:IconName` → the Tabler glyph via the page-icon by-name render path,
 * any other non-empty string → the emoji character, unset → the field-type
 * icon. Callers size it like the type icons (`size-4 stroke-[1.5px]` in
 * headers). CROSS-AGENT CONTRACT: the grid header also renders through this —
 * keep the export name stable.
 */
export function resolveFieldIcon(
  field: Pick<DatabaseField, "icon" | "type">
): FieldIconComponent {
  const icon = field.icon;
  if (!icon) {
    return DATABASE_FIELD_TYPE_ICONS[field.type];
  }
  const cacheKey = `${field.type}\u0000${icon}`;
  let component = customFieldIconCache.get(cacheKey);
  if (!component) {
    component = icon.startsWith(TABLER_PAGE_ICON_PREFIX)
      ? createTablerFieldIcon(
          icon.slice(TABLER_PAGE_ICON_PREFIX.length),
          DATABASE_FIELD_TYPE_ICONS[field.type]
        )
      : createEmojiFieldIcon(icon);
    customFieldIconCache.set(cacheKey, component);
  }
  return component;
}
