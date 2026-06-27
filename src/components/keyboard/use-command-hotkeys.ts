import { type UseHotkeyDefinition, useHotkeys } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";
import { useMemo } from "react";

import { useIsHotkeyRecording } from "@/components/keyboard/recording-gate.ts";
import {
  type CommandId,
  getCommand,
} from "@/lib/settings/keyboard-commands.ts";
import {
  type ResolvedKeybindings,
  useResolvedKeybindings,
} from "@/lib/settings/use-keybindings.ts";

export type CommandHandlers = Partial<Record<CommandId, () => void>>;

export interface UseCommandHotkeysOptions {
  /** Master switch — when false, all handlers are registered but suppressed. */
  enabled?: boolean;
  /** Restrict listeners to a DOM subtree (e.g. the canvas). Defaults to document. */
  target?: RefObject<HTMLElement | null>;
}

function buildCommandDefinitions(
  handlers: CommandHandlers,
  resolved: ResolvedKeybindings,
  active: boolean,
  target?: RefObject<HTMLElement | null>
): UseHotkeyDefinition[] {
  const defs: UseHotkeyDefinition[] = [];

  for (const id of Object.keys(handlers) as CommandId[]) {
    const handler = handlers[id];
    const command = getCommand(id);
    if (!handler || command.displayOnly) {
      continue;
    }

    const combos = [resolved[id], ...(command.aliases ?? [])];
    for (const hotkey of combos) {
      defs.push({
        hotkey,
        callback: () => handler(),
        options: {
          enabled: active,
          target,
          ...(command.preventDefault === undefined
            ? {}
            : { preventDefault: command.preventDefault }),
          ...(command.ignoreInputs === undefined
            ? {}
            : { ignoreInputs: command.ignoreInputs }),
        },
      });
    }
  }

  return defs;
}

/**
 * Registers TanStack hotkeys for the provided command handlers, using each
 * command's currently-resolved combo (default overlaid with the user's
 * override). The registry is the single source of truth for the combo; callers
 * supply only behavior and decide which commands to dispatch by which handlers
 * they pass. Per-key `ignoreInputs` from the registry keeps a command from
 * firing while a text field is focused where appropriate.
 *
 * Dispatch is automatically suppressed while the settings recorder is capturing
 * a combo, so recording never fires the command it collides with.
 */
export function useCommandHotkeys(
  handlers: CommandHandlers,
  options: UseCommandHotkeysOptions = {}
): void {
  const { target, enabled = true } = options;
  const resolved = useResolvedKeybindings();
  const isRecording = useIsHotkeyRecording();

  const definitions = useMemo<UseHotkeyDefinition[]>(
    () =>
      buildCommandDefinitions(
        handlers,
        resolved,
        enabled && !isRecording,
        target
      ),
    [handlers, resolved, target, enabled, isRecording]
  );

  useHotkeys(definitions);
}
