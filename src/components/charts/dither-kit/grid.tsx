"use client"

import { useChartPart } from "./chart-context"

export function Grid({
  horizontal = true,
  vertical = false,
  count = 4,
  minorCount = 0,
  strokeDasharray = "3 3",
}: {
  horizontal?: boolean
  vertical?: boolean
  /** Number of major horizontal grid lines (Y ticks). */
  count?: number
  /** Minor lines drawn between each pair of major lines (0 = none). */
  minorCount?: number
  strokeDasharray?: string
}) {
  const ctx = useChartPart("Grid")
  if (!ctx.ready) return null
  const { width } = ctx.plot

  const majors = ctx.y.ticks(count)
  // Subdivide each major gap into `minorCount` evenly-spaced minor values.
  const minors: number[] = []
  if (horizontal && minorCount > 0) {
    for (let i = 0; i < majors.length - 1; i++) {
      const a = majors[i]
      const b = majors[i + 1]
      for (let m = 1; m <= minorCount; m++) {
        minors.push(a + ((b - a) * m) / (minorCount + 1))
      }
    }
  }

  return (
    <g className="stroke-border">
      {horizontal &&
        minors.map((t) => (
          <line
            key={`m-${t}`}
            strokeDasharray="1 3"
            strokeOpacity={0.45}
            x1={0}
            x2={width}
            y1={ctx.y(t)}
            y2={ctx.y(t)}
          />
        ))}
      {horizontal &&
        majors.map((t) => (
          <line
            key={`h-${t}`}
            strokeDasharray={strokeDasharray}
            x1={0}
            x2={width}
            y1={ctx.y(t)}
            y2={ctx.y(t)}
          />
        ))}
      {vertical &&
        ctx.data.map((_, i) => (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable x position
            key={`v-${i}`}
            strokeDasharray={strokeDasharray}
            x1={ctx.xCenter(i) ?? 0}
            x2={ctx.xCenter(i) ?? 0}
            y1={0}
            y2={ctx.plot.height}
          />
        ))}
    </g>
  )
}

// Render beneath the dither canvas so grid lines sit behind the fill.
Grid.chartLayer = "back" as const
