import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Generates the favicon / PWA icon set from a "BW" monogram, matching the site
 * theme (near-black background, off-white mark). Outputs are static — run once
 * with `pnpm gen:icons` and commit the results; no need to regenerate per build.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const BACKGROUND = "#0a0a0a";
const FOREGROUND = "#fafafa";

/** A square monogram SVG. `fullBleed` skips the rounded corners (for masks). */
function monogramSvg({ size, fontScale = 0.42, fullBleed = false }) {
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * fontScale);
  const shape = fullBleed
    ? `<rect width="${size}" height="${size}" fill="${BACKGROUND}"/>`
    : `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${BACKGROUND}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${shape}
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="${-size * 0.012}" fill="${FOREGROUND}">BW</text>
</svg>`;
}

async function writePng(svg, size, file) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(publicDir, file));
  console.log(`gen-icons: wrote ${file} (${size}×${size})`);
}

// Crisp scalable favicon for modern browsers.
const faviconSvg = monogramSvg({ size: 512 });
await sharp(Buffer.from(faviconSvg)); // validate it renders before writing
await import("node:fs/promises").then(({ writeFile }) =>
  writeFile(join(publicDir, "favicon.svg"), `${faviconSvg}\n`)
);
console.log("gen-icons: wrote favicon.svg");

// iOS home-screen icon: full-bleed (iOS applies its own rounded mask).
await writePng(
  monogramSvg({ size: 180, fullBleed: true }),
  180,
  "apple-touch-icon.png"
);

// PWA manifest icons (rounded, "any" purpose).
await writePng(monogramSvg({ size: 192 }), 192, "icon-192.png");
await writePng(monogramSvg({ size: 512 }), 512, "icon-512.png");

// Maskable icon: full-bleed background, mark kept inside the safe zone.
await writePng(
  monogramSvg({ size: 512, fullBleed: true, fontScale: 0.3 }),
  512,
  "icon-512-maskable.png"
);

console.log("gen-icons: done");
