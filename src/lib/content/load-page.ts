import { createServerFn } from "@tanstack/react-start";

import { getShippedPageBySlug } from "@/lib/content/page-store.server.ts";
import { normalizePageSlug } from "@/lib/pages/slugify.ts";

export const loadPage = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const page = await getShippedPageBySlug(normalizePageSlug(data.slug));
    if (!page) {
      throw new Error(`Unknown page slug: ${data.slug}`);
    }
    return page;
  });
