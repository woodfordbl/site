import type { ReactNode } from "react";

import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview Basemap credit, in the app's type rather than MapLibre's.
 *
 * MapLibre's own control is a white pill with an ⓘ toggle that carries its own
 * focus ring and font — foreign chrome on every map. This renders the same
 * required credit as one muted line, sized like a caption.
 *
 * It is always visible and never behind a toggle or a hover: CARTO's terms and
 * the OSM attribution guidelines both require the credit to be shown on the
 * map itself, so this is the one piece of map chrome that must not fade out
 * with the controls. The links stay real links, which is how OSM asks to be
 * credited on interactive maps.
 *
 * Blank-canvas maps (the `region` mark) render no basemap at all — their
 * polygons are Natural Earth, which is public domain — so they show nothing.
 */

interface AttributionSource {
  href: string;
  label: string;
}

/** Credits for the CARTO basemap this app uses, in CARTO's stated order. */
const BASEMAP_SOURCES: readonly AttributionSource[] = [
  { href: "https://carto.com/attributions", label: "CARTO" },
  {
    href: "https://www.openstreetmap.org/copyright",
    label: "OpenStreetMap",
  },
];

export function MapAttribution({
  className,
}: {
  className?: string;
}): ReactNode {
  return (
    <p
      className={cn(
        "pointer-events-none absolute right-2 bottom-1.5 z-10 text-[10px] text-muted-foreground/70 leading-none",
        className
      )}
    >
      {BASEMAP_SOURCES.map((source, index) => (
        <span key={source.href}>
          {index > 0 ? <span aria-hidden> · </span> : null}
          <a
            className="pointer-events-auto underline-offset-2 hover:text-muted-foreground hover:underline"
            href={source.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            © {source.label}
          </a>
        </span>
      ))}
    </p>
  );
}
