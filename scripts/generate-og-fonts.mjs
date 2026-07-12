/**
 * Regenerate src/lib/og/og-fonts.ts — base64-embedded static font subsets for
 * the /api/og Satori renderer.
 *
 *   node scripts/generate-og-fonts.mjs
 *
 * Satori cannot read the variable woff2 files the site ships through
 * fontsource, and passing a custom `fonts` array to ImageResponse replaces
 * the bundled regular weight entirely — so every face/weight a card variant
 * uses must be embedded here explicitly. Static latin woff subsets are
 * ~40 KB each.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const FONTS = [
  {
    constName: "GEIST_400_WOFF_BASE64",
    file: "@fontsource/geist-sans/files/geist-sans-latin-400-normal.woff",
    name: "Geist",
    weight: 400,
  },
  {
    constName: "GEIST_600_WOFF_BASE64",
    file: "@fontsource/geist-sans/files/geist-sans-latin-600-normal.woff",
    name: "Geist",
    weight: 600,
  },
  {
    constName: "SOURCE_SERIF_600_WOFF_BASE64",
    file: "@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff",
    name: "Source Serif 4",
    weight: 600,
  },
];

const consts = FONTS.map((font) => {
  const base64 = readFileSync(require.resolve(font.file)).toString("base64");
  return `const ${font.constName} =\n  "${base64}";`;
}).join("\n\n");

const entries = FONTS.map(
  (font) =>
    `    {\n      name: "${font.name}",\n      data: decode(${font.constName}),\n      weight: ${font.weight},\n      style: "normal",\n    },`
).join("\n");

const out = `/**
 * Static font data for the /api/og Satori renderer.
 *
 * Satori cannot read the variable woff2 files the site ships through
 * fontsource, and passing a custom \`fonts\` array to ImageResponse replaces
 * the bundled regular-weight default entirely — so every face/weight a card
 * variant uses ships here explicitly (latin static woff subsets, ~40 KB
 * each), embedded so the endpoint needs no runtime fetch or bundler asset
 * wiring.
 *
 * Generated file — do not edit by hand. Regenerate with:
 *   node scripts/generate-og-fonts.mjs
 */

${consts}

function decode(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

export interface OgFont {
  data: Buffer;
  name: string;
  style: "normal";
  weight: 400 | 600;
}

export function getOgFonts(): OgFont[] {
  return [
${entries}
  ];
}
`;

const target = fileURLToPath(
  new URL("../src/lib/og/og-fonts.ts", import.meta.url)
);
writeFileSync(target, out);
console.log(`Wrote ${target} (${Math.round(out.length / 1024)} KB).`);
