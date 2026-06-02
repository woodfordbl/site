import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createServerFn } from "@tanstack/react-start";

import { slugToRelativePath } from "@/lib/content/page-path.ts";
import { pageSchema } from "@/lib/schemas/page.ts";

export const loadPage = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const relativePath = slugToRelativePath(data.slug);
    const filePath = join(process.cwd(), "content", "pages", relativePath);
    const raw = await readFile(filePath, "utf-8");
    const parsed = pageSchema.parse(JSON.parse(raw));
    return parsed;
  });
