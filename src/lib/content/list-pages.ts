import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { createServerFn } from "@tanstack/react-start";
import { pageSchema } from "@/lib/schemas/page.ts";

export interface PageSummary {
  id: string;
  parentId: string | null;
  /** How to navigate to this page in the sidebar and links. */
  routeBy?: "id" | "slug";
  slug: string;
  title: string;
}

async function collectJsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files;
}

export const listPages = createServerFn({ method: "GET" }).handler(
  async (): Promise<PageSummary[]> => {
    const pagesDir = join(process.cwd(), "content", "pages");
    const jsonFiles = await collectJsonFiles(pagesDir);

    const pages = await Promise.all(
      jsonFiles.map(async (filePath) => {
        const raw = await readFile(filePath, "utf-8");
        const parsed = pageSchema.parse(JSON.parse(raw));

        return {
          id: parsed.id,
          slug: parsed.slug,
          title: parsed.title,
          parentId: parsed.parentId,
        };
      })
    );

    return pages.sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
    );
  }
);
