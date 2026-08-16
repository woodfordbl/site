import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertAuthorSaveAllowed } from "@/lib/content/author-save-guard.ts";

const mediaAssetSchema = z.object({
  assetId: z.string(),
  base64: z.string(),
  extension: z.string(),
  mimeType: z.string(),
});

const saveMediaAssetsInputSchema = z.object({
  assets: z.array(mediaAssetSchema),
});

export const saveMediaAssets = createServerFn({ method: "POST" })
  .validator((data: unknown) => saveMediaAssetsInputSchema.parse(data))
  .handler(async ({ data }) => {
    assertAuthorSaveAllowed();
    const mediaDir = join(process.cwd(), "public", "media");
    await mkdir(mediaDir, { recursive: true });

    for (const asset of data.assets) {
      const filePath = join(mediaDir, `${asset.assetId}.${asset.extension}`);
      await writeFile(filePath, Buffer.from(asset.base64, "base64"));
    }

    return { ok: true as const, count: data.assets.length };
  });
