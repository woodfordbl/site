import { z } from "zod";

export const settingsSearchSchema = z.object({
  pageId: z.string().optional(),
  returnTo: z.string().optional(),
});

export type SettingsSearch = z.infer<typeof settingsSearchSchema>;

export function parseSettingsSearch(
  search: Record<string, unknown>
): SettingsSearch {
  const result = settingsSearchSchema.safeParse(search);
  return result.success ? result.data : {};
}

export function resolveSettingsReturnTo(search: SettingsSearch): string {
  const candidate = search.returnTo?.trim();
  if (candidate?.startsWith("/")) {
    return candidate;
  }
  return "/";
}
