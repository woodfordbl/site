import { createServerFn } from "@tanstack/react-start";
import type { PageSidebarPrefs } from "@/lib/pages/page-sidebar-pin-cookie.ts";
import { readPageSidebarPrefsFromRequest } from "@/lib/pages/read-page-sidebar-prefs.server.ts";

export const getPageSidebarPrefs = createServerFn({ method: "GET" }).handler(
  async (): Promise<PageSidebarPrefs> => readPageSidebarPrefsFromRequest()
);
