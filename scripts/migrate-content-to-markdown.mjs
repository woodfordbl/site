import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * One-shot migration of `content/pages/**∕*.json` (block JSON) to the
 * canonical markdown format. For each JSON page: serialize with the codec,
 * write the folder/index layout, RE-PARSE the written file, and verify the
 * content survived before deleting the JSON source. Idempotent: exits early
 * when no JSON pages remain.
 *
 * Uses Vite's SSR module loader so the TypeScript codec runs unbundled.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = join(root, "content", "pages");

async function collectFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => []
  );
  const files = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath, extension)));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(entryPath);
    }
  }
  return files;
}

const jsonFiles = await collectFiles(pagesDir, ".json");
if (jsonFiles.length === 0) {
  console.log(
    "migrate-content-to-markdown: no JSON pages found — nothing to do"
  );
  process.exit(0);
}

process.env.VITEST = "1"; // keeps Nitro's dev-server hooks quiet in middlewareMode
const server = await createServer({
  configFile: false,
  logLevel: "silent",
  appType: "custom",
  server: { middlewareMode: true, hmr: false },
  resolve: { alias: { "@": join(root, "src") } },
});

try {
  const { serializePageMarkdown } = await server.ssrLoadModule(
    "/src/lib/markdown-canonical/serialize-page.ts"
  );
  const { pageToFrontmatter } = await server.ssrLoadModule(
    "/src/lib/markdown-canonical/frontmatter.ts"
  );
  const { assembleMarkdownPages } = await server.ssrLoadModule(
    "/src/lib/content/assemble-markdown-pages.ts"
  );
  const { getTextFromBlock } = await server.ssrLoadModule(
    "/src/lib/blocks/create-block.ts"
  );

  const pages = [];
  for (const file of jsonFiles) {
    pages.push({ file, page: JSON.parse(await readFile(file, "utf8")) });
  }

  // Target layout: folder/index.md when the slug has children, else leaf.
  const slugs = new Set(pages.map(({ page }) => page.slug));
  const targetPathFor = (slug) => {
    if (slug === "/") {
      return "index.md";
    }
    const stem = slug.slice(1);
    const hasChildren = [...slugs].some((other) =>
      other.startsWith(`${slug}/`)
    );
    return hasChildren ? `${stem}/index.md` : `${stem}.md`;
  };
  const pathBySlug = new Map(
    pages.map(({ page }) => [page.slug, targetPathFor(page.slug)])
  );
  const byId = new Map(pages.map(({ page }) => [page.id, page]));

  const relativeHref = (fromPath, toPath) => {
    const fromDir = dirname(fromPath);
    const href = relative(fromDir === "." ? "" : fromDir, toPath).replaceAll(
      "\\",
      "/"
    );
    return href.startsWith(".") ? href : `./${href}`;
  };

  const written = [];
  for (const { page } of pages) {
    const targetPath = pathBySlug.get(page.slug);
    const markdown = serializePageMarkdown(
      page.blocks,
      pageToFrontmatter(page),
      {
        resolvePathByPageId: (pageId) => {
          const target = byId.get(pageId);
          if (!target || pageId === page.id) {
            return;
          }
          return relativeHref(targetPath, pathBySlug.get(target.slug));
        },
        resolveLabelByPageId: (pageId) => byId.get(pageId)?.title,
      }
    );
    const filePath = join(pagesDir, targetPath);
    await writeFile(filePath, markdown, "utf8");
    written.push({ relativePath: targetPath, raw: markdown });
    console.log(`  wrote content/pages/${targetPath}`);
  }

  // Verify: reparse everything written and compare the content that must
  // survive (metadata + non-blank block text/type sequence).
  const reparsed = assembleMarkdownPages(written);
  const reparsedById = new Map(reparsed.map((page) => [page.id, page]));
  const meaningfulBlocks = (blocks) =>
    blocks
      .filter(
        (block) =>
          !(block.type === "text" && getTextFromBlock(block).trim() === "")
      )
      .map((block) => `${block.type}:${getTextFromBlock(block)}`);

  for (const { page } of pages) {
    const back = reparsedById.get(page.id);
    if (!back) {
      throw new Error(
        `verification failed: ${page.slug} missing after reparse`
      );
    }
    for (const key of ["slug", "title", "icon", "parentId"]) {
      const before = page[key] ?? null;
      const after = back[key] ?? null;
      if (before !== after) {
        throw new Error(
          `verification failed: ${page.slug} ${key} ${before} -> ${after}`
        );
      }
    }
    const beforeBlocks = meaningfulBlocks(page.blocks);
    const afterBlocks = meaningfulBlocks(back.blocks);
    if (JSON.stringify(beforeBlocks) !== JSON.stringify(afterBlocks)) {
      throw new Error(
        `verification failed: ${page.slug} blocks diverged\n  before: ${JSON.stringify(beforeBlocks)}\n  after:  ${JSON.stringify(afterBlocks)}`
      );
    }
  }

  for (const file of jsonFiles) {
    await rm(file);
    console.log(`  removed ${relative(root, file)}`);
  }
  console.log(
    `migrate-content-to-markdown: migrated ${pages.length} pages, verification passed`
  );
} finally {
  await server.close();
}
process.exit(0);
