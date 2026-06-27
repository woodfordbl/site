import { useLiveQuery } from "@tanstack/react-db";
import { type Hotkey, normalizeHotkey } from "@tanstack/react-hotkeys";
import { useMemo } from "react";

import { localKeybindingsCollection } from "@/db/collections/local-collections.ts";
import {
  type CommandId,
  getCommand,
  KEYBOARD_COMMANDS,
} from "@/lib/settings/keyboard-commands.ts";

export type ResolvedKeybindings = Record<CommandId, Hotkey>;

/** Overlay registry defaults with any user override rows. */
function resolveFromOverrides(
  overrides: Map<string, string>
): ResolvedKeybindings {
  const resolved = {} as ResolvedKeybindings;
  for (const command of KEYBOARD_COMMANDS) {
    const override = overrides.get(command.id);
    resolved[command.id] =
      (override as Hotkey | undefined) ?? command.defaultHotkey;
  }
  return resolved;
}

/**
 * Reactive map of every command's currently-effective combo (default overlaid
 * with the user's override, if any). Re-renders when overrides change.
 */
export function useResolvedKeybindings(): ResolvedKeybindings {
  const { data: overrideRows = [] } = useLiveQuery((query) =>
    query.from({ binding: localKeybindingsCollection })
  );

  return useMemo(() => {
    const overrides = new Map(overrideRows.map((row) => [row.id, row.hotkey]));
    return resolveFromOverrides(overrides);
  }, [overrideRows]);
}

/** Resolve a single command's effective combo (non-reactive convenience). */
export function resolveHotkey(
  id: CommandId,
  resolved: ResolvedKeybindings
): Hotkey {
  return resolved[id] ?? getCommand(id).defaultHotkey;
}

/** Canonical form used to compare combos regardless of modifier order/casing. */
function canonicalize(hotkey: string): string {
  try {
    return normalizeHotkey(hotkey);
  } catch {
    return hotkey;
  }
}

/**
 * The command (other than `excludeId`) currently bound to `candidate`, or null
 * if the combo is free. Compares canonicalized combos so e.g. "Shift+Mod+S" and
 * "Mod+Shift+S" collide.
 */
export function findConflict(
  candidate: string,
  resolved: ResolvedKeybindings,
  excludeId: CommandId
): CommandId | null {
  const target = canonicalize(candidate);
  for (const command of KEYBOARD_COMMANDS) {
    if (command.id === excludeId || command.displayOnly) {
      continue;
    }
    if (canonicalize(resolved[command.id]) === target) {
      return command.id;
    }
  }
  return null;
}
