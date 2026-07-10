/**
 * Regenerate the favicon/app-icon set in public/ from one source of truth.
 *
 *   node scripts/generate-icons.mjs
 *
 * - Outlines "BW" from the static Geist Bold woff (opentype.js), so the SVG
 *   and every PNG render identically with zero font dependencies.
 * - Renders PNGs with sharp.
 * - Writes a PNG-frame ICO by hand (16/32/48 — supported by every modern
 *   browser).
 *
 * Palette: terracotta #e54723 field (--primary, dark theme, gamut-mapped to
 * sRGB), cream #fff7f2 mark. Outputs: favicon.svg, favicon.ico,
 * apple-touch-icon.png (180, full-bleed square — iOS applies its own mask),
 * icon-192/512.png (rounded), icon-512-maskable.png (mark in the 80% safe
 * zone).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The bare "opentype.js" specifier trips Biome's resolver (the package name
// looks like a file path), so import its dist module directly.
import { parse as parseFont } from "opentype.js/dist/opentype.mjs";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const FONT = require.resolve(
  "@fontsource/geist-sans/files/geist-sans-latin-700-normal.woff"
);
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const FIELD = "#e54723";
const MARK = "#fff7f2";
const SIZE = 512;
const RADIUS = 113;
const FONT_SIZE = 205;
const LETTER_SPACING = -0.03; // em (opentype.js letterSpacing unit)

const fontBuffer = readFileSync(FONT);
const font = parseFont(
  fontBuffer.buffer.slice(
    fontBuffer.byteOffset,
    fontBuffer.byteOffset + fontBuffer.byteLength
  )
);

function monogramPath(fontSize, box) {
  const glyphs = font.stringToGlyphs("BW");
  const scale = fontSize / font.unitsPerEm;
  // Total advance width including spacing between (not after) letters.
  let width = 0;
  for (const [i, glyph] of glyphs.entries()) {
    width += glyph.advanceWidth * scale;
    if (i < glyphs.length - 1) {
      width += LETTER_SPACING * fontSize;
    }
  }
  const x = (box - width) / 2;
  // Vertically center on cap height for optical balance (no descenders in BW).
  const capHeight =
    (font.tables.os2?.sCapHeight ?? font.ascender * 0.72) * scale;
  const y = box / 2 + capHeight / 2;
  const p = font.getPath("BW", x, y, fontSize, {
    letterSpacing: LETTER_SPACING,
  });
  return p.toPathData(2);
}

const d = monogramPath(FONT_SIZE, SIZE);

// Rounded source (favicon.svg, tab icons, PWA "any" icons).
const roundedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="${FIELD}"/>
  <path fill="${MARK}" d="${d}"/>
</svg>
`;

// Full-bleed square (apple-touch-icon — iOS applies its own mask).
const squareSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${FIELD}"/>
  <path fill="${MARK}" d="${d}"/>
</svg>
`;

// Maskable: full-bleed field, mark shrunk into the 80% safe zone.
const safeD = monogramPath(FONT_SIZE * 0.8, SIZE);
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${FIELD}"/>
  <path fill="${MARK}" d="${safeD}"/>
</svg>
`;

function png(svg, size) {
  return sharp(Buffer.from(svg), { density: (72 * size) / SIZE })
    .resize(size, size)
    .png()
    .toBuffer();
}

function writeIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);
  const dirs = [];
  let offset = 6 + 16 * frames.length;
  for (const frame of frames) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(frame.size === 256 ? 0 : frame.size, 0); // width
    dir.writeUInt8(frame.size === 256 ? 0 : frame.size, 1); // height
    dir.writeUInt16LE(1, 4); // planes
    dir.writeUInt16LE(32, 6); // bpp
    dir.writeUInt32LE(frame.data.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += frame.data.length;
    dirs.push(dir);
  }
  return Buffer.concat([header, ...dirs, ...frames.map((f) => f.data)]);
}

writeFileSync(path.join(PUBLIC_DIR, "favicon.svg"), roundedSvg);
writeFileSync(
  path.join(PUBLIC_DIR, "icon-512.png"),
  await png(roundedSvg, 512)
);
writeFileSync(
  path.join(PUBLIC_DIR, "icon-192.png"),
  await png(roundedSvg, 192)
);
writeFileSync(
  path.join(PUBLIC_DIR, "icon-512-maskable.png"),
  await png(maskableSvg, 512)
);
writeFileSync(
  path.join(PUBLIC_DIR, "apple-touch-icon.png"),
  await png(squareSvg, 180)
);

const icoFrames = [];
for (const size of [16, 32, 48]) {
  icoFrames.push({ size, data: await png(roundedSvg, size) });
}
writeFileSync(path.join(PUBLIC_DIR, "favicon.ico"), writeIco(icoFrames));

console.log("Icon set written to public/.");
