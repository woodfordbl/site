import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generates public/sitemap.xml (and a robots.txt referencing it) for shipped
 * pages. Runs only when a production origin is known — on Vercel builds via
 * VERCEL_PROJECT_PRODUCTION_URL, or locally via SITE_ORIGIN.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = join(root, "content", "pages");
const TRAILING_SLASH_RE = /\/$/;

function resolveOrigin() {
  if (process.env.SITE_ORIGIN) {
    return process.env.SITE_ORIGIN.replace(TRAILING_SLASH_RE, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return null;
}

async function collectPageFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectPageFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }
  return files;
}

const origin = resolveOrigin();
if (!origin) {
  console.log(
    "generate-sitemap: no SITE_ORIGIN/VERCEL_PROJECT_PRODUCTION_URL — skipping"
  );
  process.exit(0);
}

const files = await collectPageFiles(pagesDir);
const slugs = [];
for (const file of files) {
  const parsed = JSON.parse(await readFile(file, "utf8"));
  if (typeof parsed.slug === "string") {
    slugs.push(parsed.slug);
  }
}
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
