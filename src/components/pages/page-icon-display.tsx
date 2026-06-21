"use client";

import { useLoaderData } from "@tanstack/react-router";
import { TablerGlyph } from "@/components/pages/tabler-glyph.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { DEFAULT_PAGE_ICON, decodePageIcon } from "@/lib/pages/page-icon.ts";
import {
  type TablerIconGlyph,
  useTablerIconGlyph,
} from "@/lib/pages/page-icon-catalog.ts";
import { cn } from "@/lib/utils.ts";

export interface PageIconDisplayProps {
  className?: string;
  icon?: string;
}

/** Resolves a stored Tabler name against the deferred catalog; paints the default icon until ready. */
function TablerPageIcon({
  className,
  name,
  preloadedGlyph,
}: {
  className?: string;
  name: string;
  preloadedGlyph?: TablerIconGlyph;
}) {
  const isClient = useIsClient();
  const catalogGlyph = useTablerIconGlyph(name);
  const resolved = preloadedGlyph ?? (isClient ? catalogGlyph : undefined);

  if (!resolved) {
    return <DEFAULT_PAGE_ICON aria-hidden className={className} />;
  }

  return (
    <TablerGlyph
      className={className}
      filled={resolved.filled}
      node={resolved.node}
    />
  );
}

export function PageIconDisplay({ className, icon }: PageIconDisplayProps) {
  const { sidebarTablerGlyphs } = useLoaderData({ from: "__root__" });
  const decoded = decodePageIcon(icon);

  if (decoded.kind === "emoji") {
    return (
      <span
        aria-label={decoded.value}
        className={cn(
          "inline-flex shrink-0 items-center justify-center leading-none",
          className
        )}
        role="img"
      >
        {decoded.value}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-muted-foreground",
        className
      )}
    >
      {decoded.kind === "tabler" ? (
        <TablerPageIcon
          name={decoded.name}
          preloadedGlyph={sidebarTablerGlyphs[decoded.name]}
        />
      ) : (
        <DEFAULT_PAGE_ICON aria-hidden />
      )}
    </span>
  );
}
