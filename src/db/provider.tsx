import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import "@/db/collections/local-collections.ts";
import { MigrateUserPageRoutesEffect } from "@/components/pages/migrate-user-page-routes-effect.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { getQueryClient } from "@/db/client.ts";

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <MigrateUserPageRoutesEffect />
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
