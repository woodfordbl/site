import type { LocalPage } from "@/lib/schemas/local-page.ts";

/** Later sources win per id — keeps cookie/bootstrap rows until collection supersedes them. */
export function mergeLocalPageSources(...sources: LocalPage[][]): LocalPage[] {
  const byId = new Map<string, LocalPage>();

  for (const source of sources) {
    for (const page of source) {
      byId.set(page.id, page);
    }
  }

  return [...byId.values()];
}
