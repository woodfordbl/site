import { createServerFn } from "@tanstack/react-start";

import { readPageListLocalPreviewFromRequest } from "@/lib/pages/read-page-list-local-preview.server.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

export const getPageListLocalPreview = createServerFn({
  method: "GET",
}).handler(
  async (): Promise<LocalPage[]> => readPageListLocalPreviewFromRequest()
);
