import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "node_modules/@tabler/icons-react/dist/esm/icons");
const targetDir = join(root, "public/tabler");
const targetFile = join(targetDir, "icons.json");
// Bundled copy for SSR glyph subsetting — runtime fs reads from public/ are
// not available in the deployed server function.
const generatedDir = join(root, "src/generated");
const generatedFile = join(generatedDir, "tabler-icons.json");

const NODE_RE = /const __iconNode = (\[.*\]);/;
const META_RE = /createReactComponent\(\s*"(outline|filled)",\s*"([^"]+)"/;
const MJS_EXTENSION = /\.mjs$/;

async function readIcon(fileName) {
  const source = await readFile(join(iconsDir, fileName), "utf8");
  const nodeMatch = source.match(NODE_RE);
  const metaMatch = source.match(META_RE);
  if (!(nodeMatch && metaMatch)) {
    return null;
  }

  const rawNode = JSON.parse(nodeMatch[1]);
  // Drop per-element "key" props; TablerGlyph keys by index to shrink the asset.
  const node = rawNode.map(([tag, attrs]) => {
    const { key: _key, ...rest } = attrs;
    return [tag, rest];
  });

  return {
    name: fileName.replace(MJS_EXTENSION, ""),
    keywords: metaMatch[2],
    filled: metaMatch[1] === "filled",
    node,
  };
}

const entries = await readdir(iconsDir);
const files = entries.filter(
  (file) => file.endsWith(".mjs") && file !== "index.mjs"
);

const icons = [];
for (const file of files) {
  const icon = await readIcon(file);
  if (icon) {
    icons.push(icon);
  }
}

icons.sort((a, b) => a.name.localeCompare(b.name));

await mkdir(targetDir, { recursive: true });
await writeFile(targetFile, JSON.stringify(icons));
await mkdir(generatedDir, { recursive: true });
await writeFile(generatedFile, JSON.stringify(icons));

console.log(
  `sync-tabler-icons: wrote ${icons.length} icons → public/tabler/icons.json + src/generated/tabler-icons.json`
);
