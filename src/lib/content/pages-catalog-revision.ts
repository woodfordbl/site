import type { Page } from "@/lib/schemas/page.ts";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function hashString(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index++) {
    hash = Math.imul(hash, 33) + input.charCodeAt(index);
    hash %= 2_147_483_647;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/** Revision token for the shipped page catalog; changes when ids or slugs change. */
export function computePagesCatalogRevision(pages: Page[]): string {
  const payload = pages
    .map((page) => ({
      id: page.id,
      parentId: page.parentId,
      slug: page.slug,
      title: page.title,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return hashString(stableStringify(payload));
}
