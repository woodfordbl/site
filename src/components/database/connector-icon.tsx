import { IconPlugConnected } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { TablerGlyph } from "@/components/pages/tabler-glyph.tsx";
import { TABLER_PAGE_ICON_PREFIX } from "@/lib/pages/page-icon.ts";
import { useTablerIconGlyph } from "@/lib/pages/page-icon-catalog.ts";
import { cn } from "@/lib/utils.ts";

export interface ConnectorIconProps {
  className?: string;
  /** Connector glyph in page-icon format (`tabler:IconName`); emoji falls back to raw text. */
  icon?: string;
}

/**
 * Renders a connector's declared icon (`ConnectorDefinition.icon`) via the
 * page-icon by-name glyph fetch — same path as custom field icons, so no full
 * catalog download. A plug glyph paints as fallback until the glyph arrives
 * or when the connector/icon is unknown.
 */
export function ConnectorIcon({
  className,
  icon,
}: ConnectorIconProps): ReactNode {
  const tablerName = icon?.startsWith(TABLER_PAGE_ICON_PREFIX)
    ? icon.slice(TABLER_PAGE_ICON_PREFIX.length)
    : "";
  const glyph = useTablerIconGlyph(tablerName, tablerName !== "");

  if (glyph) {
    return (
      <TablerGlyph
        className={className}
        filled={glyph.filled}
        node={glyph.node}
      />
    );
  }
  if (icon && tablerName === "") {
    // Non-tabler value — treat as an emoji character, sized like an svg glyph.
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center text-sm leading-none",
          className
        )}
      >
        {icon}
      </span>
    );
  }
  return <IconPlugConnected aria-hidden className={className} />;
}
