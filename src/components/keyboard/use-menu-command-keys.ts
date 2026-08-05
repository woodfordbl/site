import { matchesKeyboardEvent } from "@tanstack/react-hotkeys";
import { type KeyboardEvent, useCallback } from "react";

import {
  type CommandId,
  getCommand,
} from "@/lib/settings/keyboard-commands.ts";
import {
  type ResolvedKeybindings,
  useResolvedKeybindings,
} from "@/lib/settings/use-keybindings.ts";

/**
 * Handlers for the `scope: "menu"` commands that a given action menu exposes.
 * Each fires against that menu's own target (the sidebar row, or the active page
 * for the header menu).
 */
export type MenuCommandHandlers = Partial<Record<CommandId, () => void>>;

/**
 * Marks a menu's own filter field (e.g. the block menu's "Search actions…",
 * which auto-focuses on open). While such a field is empty the user is not
 * typing, so menu command keys still route; once it holds a query the field owns
 * every key, including Backspace/Delete.
 */
export const MENU_COMMAND_SEARCH_ATTRIBUTE = "data-menu-command-search";

function isTypingInMenu(target: HTMLElement | null): boolean {
  if (!target) {
    return false;
  }
  if (
    target.tagName !== "INPUT" &&
    target.tagName !== "TEXTAREA" &&
    !target.isContentEditable
  ) {
    return false;
  }
  if (target.hasAttribute(MENU_COMMAND_SEARCH_ATTRIBUTE)) {
    return target instanceof HTMLInputElement && target.value.length > 0;
  }
  return true;
}

function matchesCommand(
  event: KeyboardEvent<HTMLElement>,
  id: CommandId,
  resolved: ResolvedKeybindings
): boolean {
  const combos = [resolved[id], ...(getCommand(id).aliases ?? [])];
  return combos.some((combo) => matchesKeyboardEvent(event.nativeEvent, combo));
}

/**
 * Command shortcuts scoped to an open menu. Returns an `onKeyDownCapture`
 * handler to spread onto the menu's content element: while that content is
 * mounted (i.e. the menu is open), the key bound to one of `handlers` fires
 * that action against the menu's own target — no global listener, so it never
 * competes with typing elsewhere.
 *
 * Matches against each command's currently-resolved binding (plus its registry
 * aliases) via the shared hotkey matcher, so a user's rebind (bare key or full
 * chord) fires exactly the combo the menu displays. Runs in the capture phase
 * and stops the event so it wins over the menu primitive's built-in typeahead.
 * Ignores events originating in a menu text field (e.g. the "Move to" search)
 * and inside nested submenus.
 */
export function useMenuCommandKeys(
  handlers: MenuCommandHandlers
): (event: KeyboardEvent<HTMLElement>) => void {
  const resolved = useResolvedKeybindings();

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      if (isTypingInMenu(target)) {
        return;
      }
      // Submenus (Duplicate / Move to) portal their own content that still
      // propagates keydown to this capture handler. Only act on the top-level
      // menu so e.g. Backspace inside an open submenu doesn't delete the row.
      if (target?.closest('[data-slot$="sub-content"]')) {
        return;
      }

      for (const id of Object.keys(handlers) as CommandId[]) {
        const handler = handlers[id];
        if (handler && matchesCommand(event, id, resolved)) {
          event.preventDefault();
          event.stopPropagation();
          // A command may also hold a global binding (e.g. `delete-block`).
          // React and TanStack's hotkey manager both listen on `document`, so
          // only the native immediate stop keeps the global handler from firing
          // the same action a second time.
          event.nativeEvent.stopImmediatePropagation();
          handler();
          return;
        }
      }
    },
    [handlers, resolved]
  );
}
