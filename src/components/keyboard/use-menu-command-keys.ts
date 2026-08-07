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
 * every key, including menu delete (`D`).
 */
export const MENU_COMMAND_SEARCH_ATTRIBUTE = "data-menu-command-search";

function isMenuSearchField(target: HTMLElement): boolean {
  return target.hasAttribute(MENU_COMMAND_SEARCH_ATTRIBUTE);
}

function isEditableMenuField(target: HTMLElement): boolean {
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

/** Whether an editable target should keep the key for typing instead of menu commands. */
function editableFieldOwnsKey(target: HTMLElement): boolean {
  if (!isEditableMenuField(target)) {
    return false;
  }
  if (isMenuSearchField(target)) {
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

function shouldIgnoreMenuCommandEvent(target: HTMLElement | null): boolean {
  if (target?.closest('[data-slot$="sub-content"]')) {
    return true;
  }
  return Boolean(target && editableFieldOwnsKey(target));
}

function dispatchMatchingMenuCommand(
  event: KeyboardEvent<HTMLElement>,
  handlers: MenuCommandHandlers,
  resolved: ResolvedKeybindings
): boolean {
  for (const id of Object.keys(handlers) as CommandId[]) {
    const handler = handlers[id];
    if (!(handler && matchesCommand(event, id, resolved))) {
      continue;
    }
    event.preventDefault();
    event.stopPropagation();
    // A command may also hold a global binding (e.g. `delete-block`).
    // React and TanStack's hotkey manager both listen on `document`, so
    // only the native immediate stop keeps the global handler from firing
    // the same action a second time.
    event.nativeEvent.stopImmediatePropagation();
    handler();
    return true;
  }
  return false;
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
 * Ignores events originating in a menu text field (rename, "Move to" search,
 * etc.) and inside nested submenus. Empty search fields tagged
 * {@link MENU_COMMAND_SEARCH_ATTRIBUTE} still route menu commands.
 */
export function useMenuCommandKeys(
  handlers: MenuCommandHandlers
): (event: KeyboardEvent<HTMLElement>) => void {
  const resolved = useResolvedKeybindings();

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      // Submenus portal their own content that still propagates keydown here.
      // Only act on the top-level menu so e.g. D in an open submenu doesn't
      // delete the row.
      if (shouldIgnoreMenuCommandEvent(target)) {
        return;
      }
      dispatchMatchingMenuCommand(event, handlers, resolved);
    },
    [handlers, resolved]
  );
}
