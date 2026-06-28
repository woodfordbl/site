import { z } from "zod";

/**
 * A user override for a single keyboard command. One row exists only when the
 * user has rebound the command away from its default; absence means "use the
 * registry default". `id` is the {@link CommandId}; `hotkey` is a TanStack
 * Hotkeys combo string (e.g. "Mod+J").
 */
export const localKeybindingSchema = z.object({
  id: z.string(),
  hotkey: z.string(),
  updatedAt: z.string(),
});

export type LocalKeybinding = z.infer<typeof localKeybindingSchema>;
