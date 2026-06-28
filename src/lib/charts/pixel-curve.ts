/** Minimal slice of the d3/canvas path API the staircase actually calls. */
interface PixelCurveContext {
  lineTo(x: number, y: number): void;
  moveTo(x: number, y: number): void;
}

/** Structural match for d3-shape's `CurveGenerator` (avoids a transitive import). */
interface CurveGenerator {
  areaEnd(): void;
  areaStart(): void;
  lineEnd(): void;
  lineStart(): void;
  point(x: number, y: number): void;
}

/**
 * Structurally compatible with d3-shape's `CurveFactory`, which Recharts'
 * `CurveType` accepts for the `<Line>`/`<Area>` `type` prop.
 */
export type PixelCurveFactory = (context: PixelCurveContext) => CurveGenerator;

/**
 * A d3 curve factory that renders a line as a grid-snapped staircase instead of
 * a smooth (antialiased) curve, so the plotted line lines up with the dither
 * pixel grid. `cell` is the grid size in px — pass the dither `pixelSize`.
 *
 * Use as a Recharts `<Line>`/`<Area>` `type` prop, paired with
 * `shape-rendering: crispEdges` on `.recharts-curve` so the staircase renders as
 * hard pixel steps rather than a softened diagonal.
 */
export function makePixelCurve(cell: number): PixelCurveFactory {
  const size = Math.max(1, cell);
  const snap = (value: number) => Math.round(value / size) * size;

  return (context: PixelCurveContext): CurveGenerator => {
    let started = false;
    let prevX = 0;
    let prevY = 0;

    // Walk from the previous snapped point to the next one in cell-sized steps,
    // emitting a horizontal run then a vertical riser per step so the line
    // climbs as a staircase that follows the underlying slope.
    const stepTo = (targetX: number, targetY: number) => {
      const x0 = prevX;
      const y0 = prevY;
      const tx = snap(targetX);
      const ty = snap(targetY);
      const dx = tx - x0;
      const dy = ty - y0;
      const steps = Math.max(1, Math.round(Math.abs(dx) / size));
      let penY = y0;
      for (let i = 1; i <= steps; i++) {
        const cx = x0 + (dx * i) / steps;
        const cy = snap(y0 + (dy * i) / steps);
        context.lineTo(cx, penY);
        context.lineTo(cx, cy);
        penY = cy;
      }
      prevX = tx;
      prevY = ty;
    };

    return {
      areaStart() {
        // no-op: areas reuse the same staircase topline
      },
      areaEnd() {
        // no-op
      },
      lineStart() {
        started = false;
      },
      lineEnd() {
        // no-op
      },
      point(x: number, y: number) {
        const px = +x;
        const py = +y;
        if (started) {
          stepTo(px, py);
          return;
        }
        started = true;
        prevX = snap(px);
        prevY = snap(py);
        context.moveTo(prevX, prevY);
      },
    };
  };
}
