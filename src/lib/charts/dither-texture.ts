/**
 * Ordered (Bayer-matrix) dithering of a vertical gradient, rendered to a 2D
 * canvas and returned as a data URL. This is the same algorithm a GLSL dither
 * shader runs per-fragment — compare a gradient value against a tiled Bayer
 * threshold — just computed on the CPU for a static texture we can use as an
 * SVG `<pattern>` fill. The dots thin out as the gradient fades, giving the
 * classic 1-bit "dithered gradient" look.
 */

// Bayer threshold maps, row-major. Values are 0..(n*n - 1); we normalize by n*n.
const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// biome-ignore format: keep the 8x8 matrix readable as a grid
const BAYER_8X8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

export type Rgb = [number, number, number];

/**
 * Resolves any CSS color (including `var(--token)` chains, `oklch()`, `hsl()`,
 * named colors) to a sRGB `[r, g, b]` tuple by letting the browser do the work.
 *
 * Two steps, both necessary: a hidden probe appended inside `scope` resolves
 * scoped custom properties (e.g. `--color-desktop` set on a `[data-chart]`
 * element) and `var()` chains to a concrete color string — modern browsers
 * return that as `oklch(...)`, not `rgb(...)`. A 1×1 canvas then converts that
 * concrete color to sRGB bytes via `getImageData`. Returns null off-thread.
 */
export function cssColorToRgb(scope: HTMLElement, color: string): Rgb | null {
  if (typeof document === "undefined") {
    return null;
  }

  const probe = document.createElement("span");
  probe.style.color = color;
  probe.style.display = "none";
  scope.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  scope.removeChild(probe);

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

export interface DitherGradientOptions {
  /** Dot color at the bottom; defaults to `topColor` (density-only fade). */
  bottomColor?: Rgb;
  /** Fade curve exponent. >1 keeps density high longer then drops fast. Default 1.35. */
  gamma?: number;
  /** Texture height in CSS px — should match the chart plot height so the fade aligns. */
  height: number;
  /** Bayer matrix size. 8 = finer, 4 = chunkier. Default 8. */
  matrix?: 4 | 8;
  /** Max density at the very top, 0..1. Below 1 leaves gaps even at the peak. Default 0.92. */
  peak?: number;
  /** Size of each dither cell in px (pixelation/chunkiness). Default 3. */
  pixelSize?: number;
  /** Dot color at the top of the gradient (densest). */
  topColor: Rgb;
  /** Texture width in CSS px; the pattern tiles horizontally at this width. */
  width: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Builds the dithered-gradient texture as a PNG data URL. Returns an empty
 * string when no DOM is available (SSR) — callers should generate on the client.
 */
export function createDitherGradient(options: DitherGradientOptions): string {
  if (typeof document === "undefined") {
    return "";
  }

  const {
    width,
    height,
    topColor,
    bottomColor = topColor,
    matrix = 8,
    pixelSize = 3,
    peak = 0.92,
    gamma = 1.35,
  } = options;

  const matrixData = matrix === 4 ? BAYER_4X4 : BAYER_8X8;
  const n = matrix;
  const denom = n * n;

  const cols = Math.max(1, Math.ceil(width / pixelSize));
  const rows = Math.max(1, Math.ceil(height / pixelSize));

  const canvas = document.createElement("canvas");
  canvas.width = cols * pixelSize;
  canvas.height = rows * pixelSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }

  for (let gy = 0; gy < rows; gy++) {
    // t: 0 at top → 1 at bottom. value (brightness) fades the opposite way.
    const t = rows === 1 ? 0 : gy / (rows - 1);
    const value = peak * (1 - t) ** gamma;
    const r = Math.round(lerp(topColor[0], bottomColor[0], t));
    const g = Math.round(lerp(topColor[1], bottomColor[1], t));
    const b = Math.round(lerp(topColor[2], bottomColor[2], t));
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

    for (let gx = 0; gx < cols; gx++) {
      const threshold = (matrixData[(gy % n) * n + (gx % n)] + 0.5) / denom;
      if (value > threshold) {
        ctx.fillRect(gx * pixelSize, gy * pixelSize, pixelSize, pixelSize);
      }
    }
  }

  return canvas.toDataURL();
}

/** Parses a `#rgb`/`#rrggbb` hex string into an `[r, g, b]` tuple. */
export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}
