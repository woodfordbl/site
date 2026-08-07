import { IconDatabase } from "@tabler/icons-react";
import type { ReactNode } from "react";

export const PAGE_BREADCRUMB_CHILDREN_LIMIT = 5;

/** Default glyph for database hub crumbs when the database has no custom icon. */
export const databaseHubBreadcrumbIconFallback = (
  <IconDatabase className="stroke-[1.5px]" />
);

export function breadcrumbIconFallback(
  isDatabaseHub: boolean
): ReactNode | undefined {
  return isDatabaseHub ? databaseHubBreadcrumbIconFallback : undefined;
}
