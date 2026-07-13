import { type KeyboardEvent, useCallback } from "react";

import type { CommandId } from "@/lib/settings/keyboard-commands.ts";
import { useResolvedKeybindings } from "@/lib/settings/use-keybindings.ts";

/**
 * Handlers for the `scope: "menu"` commands that a given action menu exposes.
 * Each fires against that menu's own target (the sidebar row, or the active page
 * for the header menu).
 */
export type MenuCommandHandlers = Partial<Record<CommandId, () => void>>;

/** True when `combo` is a single bare key (no `Mod`/`Shift`/`Alt` segment). */
function matchesBareKey(combo: string, event: KeyboardEvent): boolean {
  // Menu commands never carry modifiers; a chord here means a mis-set default.
  if (combo.includes("+")) {
    return false;
  }
  if (combo.length === 1) {
    return event.key.toLowerCase() === combo.toLowerCase();
  }
  // Named keys such as "Backspace" / "Delete" / "Enter".
  return event.key === combo;
}

/**
 * Single-key command shortcuts scoped to an open menu. Returns an
 * `onKeyDownCapture` handler to spread onto the menu's content element: while
 * that content is mounted (i.e. the menu is open), a bare key bound to one of
 * `handlers` fires that action against the menu's own target — no modifier and
 * no global listener, so it never competes with typing elsewhere.
 *
 * Runs in the capture phase and stops the event so it wins over the menu
 * primitive's built-in typeahead. Ignores modifier chords (those belong to
 * global commands) and events originating in a menu text field (e.g. the
 * "Move to" search) so typing there is untouched.
 */
export function useMenuCommandKeys(
  handlers: MenuCommandHandlers
): (event: KeyboardEvent<HTMLElement>) => void {
  const resolved = useResolvedKeybindings();

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      for (const id of Object.keys(handlers) as CommandId[]) {
        const handler = handlers[id];
        if (handler && matchesBareKey(resolved[id], event)) {
          event.preventDefault();
          event.stopPropagation();
          handler();
          return;
        }
      }
    },
    [handlers, resolved]
  );
}
