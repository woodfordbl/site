const LEADING_SLASH_PATTERN = /^\//;

export function slugifyPageSegment(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "untitled";
}

export function normalizePageSlug(slug: string): string {
  if (slug === "" || slug === "home") {
    return "/";
  }

  return slug.startsWith("/") ? slug : `/${slug}`;
}

export function parsePagePath(slug: string): string[] {
  const normalized = normalizePageSlug(slug);
  if (normalized === "/") {
    return [];
  }

  return normalized
    .replace(LEADING_SLASH_PATTERN, "")
    .split("/")
    .filter(Boolean);
}

export function getPageSegment(slug: string): string {
  const segments = parsePagePath(slug);
  return segments.at(-1) ?? "home";
}

export function getPageSlugPrefix(slug: string): string | null {
  const segments = parsePagePath(slug);
  if (segments.length <= 1) {
    return null;
  }

  return `/${segments.slice(0, -1).join("/")}`;
}

export function buildChildSlug(parentSlug: string, segment: string): string {
  if (parentSlug === "/") {
    return `/${segment}`;
  }

  return `${normalizePageSlug(parentSlug)}/${segment}`;
}

export function pageSlugParam(slug: string): string {
  const normalized = normalizePageSlug(slug);
  if (normalized === "/") {
    return "home";
  }

  return normalized.replace(LEADING_SLASH_PATTERN, "");
}

export function pageSlugsEqual(left: string, right: string): boolean {
  return normalizePageSlug(left) === normalizePageSlug(right);
}

/**
 * TanStack Router target for user-only pages (`routeBy: "id"`): `/p/$` splat.
 * @see docs/architecture/pages.md#navigation
 */
export function pageNavTargetForUserPage(slug: string): {
  params: { _splat: string };
  to: "/p/$";
} {
  return { to: "/p/$", params: { _splat: pageSlugParam(slug) } };
}

export type PageNavTarget =
  | { params?: undefined; to: "/" }
  | { params: { _splat: string }; to: "/$" }
  | { params: { _splat: string }; to: "/p/$" };

/** Shipped / lazy-seeded page route: home → `/`, else `/$` splat. @see docs/architecture/pages.md#navigation */
export function pageNavTarget(slug: string): PageNavTarget {
  const param = pageSlugParam(slug);

  if (param === "home") {
    return { to: "/" };
  }

  return { to: "/$", params: { _splat: param } };
}

export function pagePathFromParam(param: string): string {
  if (param === "home" || param === "") {
    return "/";
  }

  return normalizePageSlug(param);
}
