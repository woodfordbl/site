import { createServerFn } from "@tanstack/react-start";

import { isShippedDatabasePath } from "@/lib/content/database-paths.server.ts";

/**
 * Whether a slug the page catalog does not know sits inside a shipped
 * database's path space. The `$` route asks this before 404ing a server
 * render, so a deep link to a database's hub, row or template page reaches the
 * client resolver that can actually answer it.
 */
export const databasePathExists = createServerFn({ method: "GET" })
  .validator((data: { slug: string }) => data)
  .handler(({ data }) => Promise.resolve(isShippedDatabasePath(data.slug)));
