import { createServerFn } from "@tanstack/react-start";

import { readTemplatePageIdFromRequest } from "@/lib/pages/read-template-page.server.ts";

export const getTemplatePageId = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => readTemplatePageIdFromRequest()
);
