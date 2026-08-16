import type { Hotkey } from "@tanstack/react-hotkeys";

import { localKeybindingsCollection } from "@/db/collections/local-collections.ts";
import type { CommandId } from "@/lib/settings/keyboard-commands.ts";

/** Upsert a user override for a command's combo. */
export function setKeybindingOverride(
  id: CommandId,
  hotkey: Hotkey | string
): void {
  const now = new Date().toISOString();
  if (localKeybindingsCollection.has(id)) {
    localKeybindingsCollection.update(id, (draft) => {
      draft.hotkey = hotkey;
      draft.updatedAt = now;
    });
    return;
  }
  localKeybindingsCollection.insert({ id, hotkey, updatedAt: now });
}

/** Remove a command's override, reverting it to the registry default. */
export function clearKeybindingOverride(id: CommandId): void {
  if (localKeybindingsCollection.has(id)) {
    localKeybindingsCollection.delete(id);
  }
}
