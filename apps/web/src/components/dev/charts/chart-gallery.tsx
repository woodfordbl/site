import { type ReactNode, useState } from "react";

import { CARTESIAN_GALLERY } from "@/components/dev/charts/gallery-cartesian.tsx";
import { POLAR_GALLERY } from "@/components/dev/charts/gallery-polar.tsx";
import { TIME_GALLERY } from "@/components/dev/charts/gallery-time.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  CHART_PALETTES,
  CHART_SERIES_COLOR_VARS,
  type ChartPaletteId,
  chartPaletteIds,
} from "@/lib/charts/chart-palettes.ts";
import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview The dev chart gallery: every chart the site can draw, rendered
 * from the same data, under a palette you can switch.
 *
 * The point of the switcher is that nothing re-renders when you use it. A
 * palette is a CSS scope, and marks paint in `var(--chart-N)` — so changing the
 * palette on the wrapper restyles every chart on the page through the cascade,
 * with no new scene, no re-measured layout, and no chance of a chart drifting
 * out of step with its legend. If a chart here fails to follow the switcher, it
 * has hard-coded a color, and that is the bug the page is built to expose.
 *
 * The "compare all" mode drops the switcher and renders one row per palette
 * instead, for judging the ramps against each other rather than one at a time.
 */

/** Every gallery entry: Cartesian marks, then polar, then the time-axis pair. */
const GALLERY_ENTRIES = [
  ...CARTESIAN_GALLERY,
  ...POLAR_GALLERY,
  ...TIME_GALLERY,
];

/** The five palette tokens as swatches, resolved by the enclosing scope. */
function PaletteSwatchRow(): ReactNode {
  return (
    <div className="flex shrink-0 gap-1.5">
      {CHART_SERIES_COLOR_VARS.map((color) => (
        <span
          className="size-4 rounded-sm ring-1 ring-foreground/10"
          key={color}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

/** One palette's name and swatches, in its own scope. */
function PaletteRow({ palette }: { palette: ChartPaletteId }): ReactNode {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
      data-chart-palette={palette}
    >
      <span className="min-w-24 font-medium text-foreground text-sm">
        {CHART_PALETTES[palette].label}
      </span>
      <PaletteSwatchRow />
    </div>
  );
}

/** Palette picker — a chip per palette, each previewing its own ramp. */
function PaletteToggle({
  onSelect,
  selected,
}: {
  onSelect: (palette: ChartPaletteId) => void;
  selected: ChartPaletteId;
}): ReactNode {
  return (
    <div className="flex flex-wrap gap-2">
      {chartPaletteIds().map((palette) => (
        <Button
          aria-pressed={palette === selected}
          className={cn(
            "gap-2",
            palette === selected && "ring-2 ring-ring ring-offset-1"
          )}
          data-chart-palette={palette}
          key={palette}
          onClick={() => onSelect(palette)}
          size="sm"
          variant={palette === selected ? "secondary" : "outline"}
        >
          <PaletteSwatchRow />
          {CHART_PALETTES[palette].label}
        </Button>
      ))}
    </div>
  );
}

/** The chart grid under one palette scope. */
function GalleryGrid({ palette }: { palette: ChartPaletteId }): ReactNode {
  return (
    <div
      className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3"
      data-chart-palette={palette}
    >
      {GALLERY_ENTRIES.map((entry) => (
        <Card key={entry.title}>
          <CardHeader>
            <CardTitle>{entry.title}</CardTitle>
            <CardDescription>{entry.description}</CardDescription>
          </CardHeader>
          <CardContent>{entry.chart}</CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * A compact strip of every chart under one palette — the row the compare-all
 * mode repeats per palette, so the ramps can be judged side by side.
 */
function PaletteComparisonRow({
  palette,
}: {
  palette: ChartPaletteId;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3" data-chart-palette={palette}>
      <div className="flex items-center gap-3">
        <h3 className="font-medium text-foreground text-sm">
          {CHART_PALETTES[palette].label}
        </h3>
        <PaletteSwatchRow />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GALLERY_ENTRIES.slice(0, 4).map((entry) => (
          <div
            className="rounded-lg border border-border/60 p-2"
            key={entry.title}
          >
            {entry.chart}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartGallerySection(): ReactNode {
  const [palette, setPalette] = useState<ChartPaletteId>("colorful");
  const [compareAll, setCompareAll] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading font-semibold text-foreground text-lg">
          Charts
        </h2>
        <p className="text-muted-foreground text-sm">
          Every mark the site draws, on TanStack Charts. Switching palette
          restyles the whole page through CSS — a chart that does not follow has
          hard-coded a color.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {compareAll ? (
          <p className="text-muted-foreground text-sm">
            Comparing all {chartPaletteIds().length} palettes.
          </p>
        ) : (
          <PaletteToggle onSelect={setPalette} selected={palette} />
        )}
        <span className="flex shrink-0 items-center gap-2 text-sm">
          <Switch
            aria-label="Compare all palettes"
            checked={compareAll}
            onCheckedChange={setCompareAll}
          />
          Compare all palettes
        </span>
      </div>

      {compareAll ? (
        <div className="flex flex-col gap-6">
          {chartPaletteIds().map((id) => (
            <PaletteComparisonRow key={id} palette={id} />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {chartPaletteIds().map((id) => (
              <PaletteRow key={id} palette={id} />
            ))}
          </div>
          <GalleryGrid palette={palette} />
        </>
      )}
    </section>
  );
}
