import { useMigrateUserPageRoutes } from "@/hooks/use-migrate-user-page-routes.ts";

/** One-time slug cleanup and legacy slug → `/p/id` redirects. */
export function MigrateUserPageRoutesEffect() {
  useMigrateUserPageRoutes();
  return null;
}
