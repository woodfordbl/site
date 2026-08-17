import { useMigrateUserPageRoutes } from "@/hooks/use-migrate-user-page-routes.ts";

/** One-time slug cleanup and legacy `/p/id` → slug redirects. */
export function MigrateUserPageRoutesEffect() {
  useMigrateUserPageRoutes();
  return null;
}
