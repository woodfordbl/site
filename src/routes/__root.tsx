import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import { AppDevtools } from "@/components/dev/app-devtools.tsx";
import { AppProviders } from "@/db/provider.tsx";
import { pageListQueryOptions } from "@/lib/content/page-list-query.ts";
import { hasAnyLocalDrafts } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { loadDirtyPageIds } from "@/lib/local-draft/load-dirty-page-ids.ts";
import type { RouterContext } from "@/router-context.ts";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const dirtyPageIds = await loadDirtyPageIds();
    return {
      hasAnyLocalDrafts: hasAnyLocalDrafts(dirtyPageIds),
    };
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(pageListQueryOptions),
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Blake Woodford",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
        {import.meta.env.DEV ? <AppDevtools /> : null}
        <Scripts />
      </body>
    </html>
  );
}
