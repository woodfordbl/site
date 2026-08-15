import type { Page } from "@/lib/schemas/page.ts";

/**
 * The incoming `createdAt` comes from the local page row, which is stamped at
 * lazy-seed time for shipped pages. Keep whatever the shipped file already
 * recorded so re-saving an existing page never resets its creation date.
 * Matched by id rather than path so a slug rename still finds the prior file.
 */
export function preserveShippedCreatedAt(
  data: Page,
  shippedPages: Page[]
): Page {
  const shippedCreatedAt = shippedPages.find(
    (page) => page.id === data.id
  )?.createdAt;

  return shippedCreatedAt ? { ...data, createdAt: shippedCreatedAt } : data;
}
