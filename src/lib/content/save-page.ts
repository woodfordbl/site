import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createServerFn } from "@tanstack/react-start";

import { slugToRelativePath } from "@/lib/content/page-path.ts";
import { pageSchema } from "@/lib/schemas/page.ts";

function assertAuthorSaveAllowed() {
  if (!import.meta.env.DEV) {
    throw new Error("Author save is only available in development");
  }
}

export const savePage = createServerFn({ method: "POST" })
  .validator((data: unknown) => pageSchema.parse(data))
  .handler(async ({ data }) => {
    assertAuthorSaveAllowed();
    const relativePath = slugToRelativePath(data.slug);
    const filePath = join(process.cwd(), "content", "pages", relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    return { ok: true as const, path: filePath };
  });
