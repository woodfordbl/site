import { type Hotkey, normalizeHotkey } from "@tanstack/react-hotkeys";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { localKeybindingsCollection } from "@/db/collections/local-collections.ts";
import {
  type CommandId,
  getCommand,
  KEYBOARD_COMMANDS,
} from "@/lib/settings/keyboard-commands.ts";
import type { LocalKeybinding } from "@/lib/schemas/local-keybinding.ts";

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

/** Stable empty list used as the SSR snapshot (overrides are browser-only). */
const SERVER_OVERRIDE_ROWS: LocalKeybinding[] = [];

function readLiveOverrideRows(): LocalKeybinding[] {
  if (typeof window === "undefined") {
    return SERVER_OVERRIDE_ROWS;
  }
  return localKeybindingsCollection.toArray;
}

/**
 * SSR-safe subscription to the user's keybinding override rows.
 *
 * Overrides live only in browser localStorage, so there is no store to read
 * during SSR. Reading via `useLiveQuery` (which subscribes through
 * `useSyncExternalStore` without a server snapshot) throws "Missing
 * getServerSnapshot" and aborts the render — a hard 500 on any route rendered
 * outside a recoverable boundary, e.g. the not-found page that bots probe.
 * Subscribing directly with an explicit server snapshot keeps SSR working;
 * mirrors the local-pages collection hook.
 */
function useKeybindingOverrideRows(): LocalKeybinding[] {
  const snapshotRef = useRef<LocalKeybinding[]>(readLiveOverrideRows());

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    snapshotRef.current = readLiveOverrideRows();

    const subscription = localKeybindingsCollection.subscribeChanges(() => {
      snapshotRef.current = readLiveOverrideRows();
      onStoreChange();
    });

    if (localKeybindingsCollection.isReady()) {
      snapshotRef.current = readLiveOverrideRows();
      onStoreChange();
    }

    return () => subscription.unsubscribe();
  }, []);

  const getSnapshot = useCallback(() => snapshotRef.current, []);
  const getServerSnapshot = useCallback(() => SERVER_OVERRIDE_ROWS, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Reactive map of every command's currently-effective combo (default overlaid
 * with the user's override, if any). Re-renders when overrides change.
 */
export function useResolvedKeybindings(): ResolvedKeybindings {
  const overrideRows = useKeybindingOverrideRows();

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
