import { createServerFn } from "@tanstack/react-start";

import { slugToRelativePath } from "@/lib/content/page-path.ts";
import { getShippedPageByRelativePath } from "@/lib/content/page-store.server.ts";

export const loadPage = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => data)
  .handler(({ data }) => {
    const page = getShippedPageByRelativePath(slugToRelativePath(data.slug));
    if (!page) {
      throw new Error(`Unknown page slug: ${data.slug}`);
    }
    return Promise.resolve(page);
  });
