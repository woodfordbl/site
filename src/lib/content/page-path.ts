import { normalizePageSlug, parsePagePath } from "@/lib/pages/slugify.ts";

const LEADING_SLASH_REGEX = /^\//;
const JSON_EXTENSION_REGEX = /\.json$/u;

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

export function relativePathToSlug(relativePath: string): string {
  const withoutExtension = relativePath.replace(JSON_EXTENSION_REGEX, "");

  if (withoutExtension === "home") {
    return "/";
  }

  return `/${withoutExtension.replace(LEADING_SLASH_REGEX, "")}`;
}
