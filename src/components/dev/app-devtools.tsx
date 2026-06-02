import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { getQueryClient } from "@/db/client.ts";

import { TanStackDbDevtoolsPanel } from "./tanstack-db-devtools-panel.tsx";

export function AppDevtools() {
  const queryClient = getQueryClient();

  return (
    <TanStackDevtools
      config={{
        position: "bottom-right",
      }}
      plugins={[
        {
          id: "tanstack-router",
          name: "TanStack Router",
          render: <TanStackRouterDevtoolsPanel />,
        },
        {
          id: "tanstack-query",
          name: "TanStack Query",
          render: <ReactQueryDevtoolsPanel client={queryClient} />,
        },
        {
          id: "tanstack-db",
          name: "TanStack DB",
          render: <TanStackDbDevtoolsPanel />,
        },
      ]}
    />
  );
}
