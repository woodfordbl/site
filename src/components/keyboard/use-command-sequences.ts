import {
  type UseHotkeySequenceDefinition,
  useHotkeySequences,
} from "@tanstack/react-hotkeys";
import { useMemo } from "react";

import { useIsHotkeyRecording } from "@/components/keyboard/recording-gate.ts";
import {
  KEYBOARD_SEQUENCES,
  type SequenceCommandId,
} from "@/lib/settings/keyboard-commands.ts";

export type SequenceHandlers = Partial<Record<SequenceCommandId, () => void>>;

/**
 * Registers Vim-style chord commands (e.g. press `G` then `H`) for the provided
 * handlers, using each command's sequence from the registry. Mirrors
 * {@link useCommandHotkeys} for single combos: the caller supplies behavior, the
 * registry owns the chord. `ignoreInputs` keeps a chord from firing while a text
 * field is focused (so typing "gh" in a block never navigates), and dispatch is
 * suppressed while the settings recorder is capturing.
 */
export function useCommandSequences(
  handlers: SequenceHandlers,
  options: { enabled?: boolean } = {}
): void {
  const { enabled = true } = options;
  const isRecording = useIsHotkeyRecording();
  const active = enabled && !isRecording;

  const definitions = useMemo<UseHotkeySequenceDefinition[]>(
    () =>
      KEYBOARD_SEQUENCES.filter((command) => handlers[command.id]).map(
        (command) => ({
          sequence: command.sequence,
          callback: () => handlers[command.id]?.(),
        })
      ),
    [handlers]
  );

  useHotkeySequences(definitions, { enabled: active, ignoreInputs: true });
}
