import { readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSiteOrigin } from "./resolve-origin.mjs";

/**
 * Generates public/sitemap.xml (and a robots.txt referencing it) for shipped
 * pages. Runs only when a production origin is known — on Vercel builds via
 * VERCEL_PROJECT_PRODUCTION_URL, or locally via SITE_ORIGIN. Slugs derive
 * from the markdown file paths (`a/index.md` and `a.md` → `/a`).
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = join(root, "content", "pages");

async function collectPageFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPageFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }
  return files;
}

const INDEX_SUFFIX_RE = /(?:^|\/)index$/;
const MD_EXTENSION_RE = /\.md$/;

function slugFromPageFile(filePath) {
  const relativePath = relative(pagesDir, filePath).replaceAll("\\", "/");
  const stem = relativePath
    .replace(MD_EXTENSION_RE, "")
    .replace(INDEX_SUFFIX_RE, "");
  return stem.length === 0 ? "/" : `/${stem}`;
}

const origin = resolveSiteOrigin();
if (!origin) {
  console.log(
    "generate-sitemap: no SITE_ORIGIN/VERCEL_PROJECT_PRODUCTION_URL — skipping"
  );
  process.exit(0);
}

const files = await collectPageFiles(pagesDir);
const slugs = [...new Set(files.map((file) => slugFromPageFile(file)))];
slugs.sort();

const urls = slugs
  .map(
    (slug) => `  <url><loc>${origin}${slug === "/" ? "/" : slug}</loc></url>`
  )
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

const robots = `# https://www.robotstxt.org/robotstxt.html
User-agent: *
Disallow: /p/

Sitemap: ${origin}/sitemap.xml
`;

await writeFile(join(root, "public", "sitemap.xml"), sitemap);
await writeFile(join(root, "public", "robots.txt"), robots);
console.log(`generate-sitemap: wrote ${slugs.length} urls for ${origin}`);
