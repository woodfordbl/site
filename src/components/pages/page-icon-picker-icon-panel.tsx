"use client";

import { useMemo } from "react";

import { TablerGlyph } from "@/components/pages/tabler-glyph.tsx";
import { GridPicker } from "@/components/ui/grid-picker.tsx";
import {
  decodePageIcon,
  formatTablerPageIcon,
  type TablerIconCatalogItem,
} from "@/lib/pages/page-icon.ts";
import { useTablerIconCatalog } from "@/lib/pages/page-icon-catalog.ts";
import { useRecentlyUsedPageIcons } from "@/lib/pages/recently-used-page-icons.ts";

export interface PageIconPickerIconPanelProps {
  onSelect: (icon: string) => void;
}

const KEBAB_SEPARATOR = /-/g;

/** Lazy-loaded Tabler icon grid for {@link PageIconPicker}, backed by the deferred icon catalog. */
export function PageIconPickerIconPanel({
  onSelect,
}: PageIconPickerIconPanelProps) {
  const { data } = useTablerIconCatalog();
  const items = data?.list ?? [];
  const { tabler: recentIcons } = useRecentlyUsedPageIcons();

  // Resolve recent `tabler:<name>` entries to catalog items, dropping unknown names.
  const recentItems = useMemo(() => {
    const byName = data?.byName;
    if (!byName || recentIcons.length === 0) {
      return [];
    }
    return recentIcons
      .map((raw) => {
        const decoded = decodePageIcon(raw);
        return decoded.kind === "tabler" ? byName.get(decoded.name) : undefined;
      })
      .filter((item): item is TablerIconCatalogItem => item !== undefined);
  }, [data?.byName, recentIcons]);

  return (
    <GridPicker<TablerIconCatalogItem>
      emptyMessage="No icons found."
      getItemLabel={(item) => item.keywords.replace(KEBAB_SEPARATOR, " ")}
      getKey={(item) => item.name}
      getSearchValue={(item) => item.keywords}
      items={items}
      onSelect={(item) => onSelect(formatTablerPageIcon(item.name))}
      recentItems={recentItems}
      renderItem={(item) => (
        <TablerGlyph className="size-5" filled={item.filled} node={item.node} />
      )}
      searchAriaLabel="Search icons"
      searchPlaceholder="Search icons…"
    />
  );
}
