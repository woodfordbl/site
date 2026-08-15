import { normalizePageSlug, parsePagePath } from "@/lib/pages/slugify.ts";

export function slugToRelativePath(slug: string): string {
  const normalized = normalizePageSlug(slug);

  if (normalized === "/") {
    return "home.json";
  }

  const segments = parsePagePath(normalized);

  for (const segment of segments) {
    if (segment === ".." || segment === ".") {
      throw new Error("Invalid slug");
    }
  }

  return `${segments.join("/")}.json`;
}
