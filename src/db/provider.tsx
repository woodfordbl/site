import type { ReactNode } from "react";

import "@/db/collections/local-collections.ts";
import { MigrateUserPageRoutesEffect } from "@/components/pages/migrate-user-page-routes-effect.tsx";
import { OrphanLocalPagesEffect } from "@/components/pages/orphan-local-pages-effect.tsx";
import { SyncPageListLocalPreviewEffect } from "@/components/pages/sync-page-list-local-preview-effect.tsx";
import { SyncPagesCatalogRevisionEffect } from "@/components/pages/sync-pages-catalog-revision-effect.tsx";
import { WarmPageIconPickerCacheEffect } from "@/components/pages/warm-page-icon-picker-cache-effect.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Root client providers: route migration, sidebar preview sync, and idle
 * icon-picker warmup. The QueryClientProvider comes from the router's
 * ssr-query integration — wrapping again here would shadow the client the
 * loaders populated (an empty one on the server, breaking SSR reads).
 * @see docs/architecture/local-first-persistence.md#app-boot-effects-appproviders
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <>
      <MigrateUserPageRoutesEffect />
      <SyncPagesCatalogRevisionEffect />
      <SyncPageListLocalPreviewEffect />
      <OrphanLocalPagesEffect />
      <WarmPageIconPickerCacheEffect />
      <TooltipProvider>
        {children}
        <Toaster closeButton position="top-center" richColors />
      </TooltipProvider>
    </>
  );
}
