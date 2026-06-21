"use client";

import { TablerGlyph } from "@/components/pages/tabler-glyph.tsx";
import { GridPicker } from "@/components/ui/grid-picker.tsx";
import {
  formatTablerPageIcon,
  type TablerIconCatalogItem,
} from "@/lib/pages/page-icon.ts";
import { useTablerIconCatalog } from "@/lib/pages/page-icon-catalog.ts";

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

  return (
    <GridPicker<TablerIconCatalogItem>
      emptyMessage="No icons found."
      getItemLabel={(item) => item.keywords.replace(KEBAB_SEPARATOR, " ")}
      getKey={(item) => item.name}
      getSearchValue={(item) => item.keywords}
      items={items}
      onSelect={(item) => onSelect(formatTablerPageIcon(item.name))}
      renderItem={(item) => (
        <TablerGlyph className="size-5" filled={item.filled} node={item.node} />
      )}
      searchAriaLabel="Search icons"
      searchPlaceholder="Search icons…"
    />
  );
}
