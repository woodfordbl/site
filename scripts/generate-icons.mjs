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

/** Render the monogram to a PNG buffer at the given pixel size. */
function renderPngBuffer(size) {
  return sharp(Buffer.from(monogramSvg({ size })))
    .resize(size, size)
    .png()
    .toBuffer();
}

/**
 * Pack PNG buffers into a single `.ico`. Modern browsers (and the address-bar /
 * bookmark UIs that prefer `favicon.ico` over the SVG) read PNG-encoded icon
 * entries directly, so no BMP conversion is needed.
 */
function encodeIco(images) {
  const HEADER_SIZE = 6;
  const ENTRY_SIZE = 16;
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4); // image count

  const entries = [];
  let offset = HEADER_SIZE + ENTRY_SIZE * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(ENTRY_SIZE);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 ⇒ 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 ⇒ 256)
    entry.writeUInt8(0, 2); // palette size (0 ⇒ no palette)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8); // image byte length
    entry.writeUInt32LE(offset, 12); // image byte offset
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([
    header,
    ...entries,
    ...images.map((image) => image.data),
  ]);
}

async function writeFavicon() {
  const sizes = [16, 32, 48];
  const images = await Promise.all(
    sizes.map(async (size) => ({ size, data: await renderPngBuffer(size) }))
  );
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(publicDir, "favicon.ico"), encodeIco(images));
  console.log(`gen-icons: wrote favicon.ico (${sizes.join(", ")})`);
}

// Crisp scalable favicon for modern browsers.
const faviconSvg = monogramSvg({ size: 512 });
await sharp(Buffer.from(faviconSvg)); // validate it renders before writing
await import("node:fs/promises").then(({ writeFile }) =>
  writeFile(join(publicDir, "favicon.svg"), `${faviconSvg}\n`)
);
console.log("gen-icons: wrote favicon.svg");

// Multi-resolution favicon.ico for legacy/address-bar contexts that ignore SVG.
await writeFavicon();

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
