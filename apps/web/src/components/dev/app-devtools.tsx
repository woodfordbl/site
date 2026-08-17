import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { getQueryClient } from "@/db/client.ts";

import { CanvasDebugOverlay } from "./canvas-debug-overlay.tsx";
import { CanvasDevtoolsPanel } from "./canvas-devtools-panel.tsx";
import { TanStackDbDevtoolsPanel } from "./tanstack-db-devtools-panel.tsx";

export function AppDevtools() {
  const queryClient = getQueryClient();

  return (
    <>
      {/* Mounted here (not in the panel) so the overlay survives closing the
          devtools drawer; it renders nothing unless its flag is on. */}
      <CanvasDebugOverlay />
      <TanStackDevtools
        config={{
          position: "bottom-right",
        }}
        plugins={[
          {
            id: "canvas",
            name: "Canvas",
            render: <CanvasDevtoolsPanel />,
          },
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
    </>
  );
}
