"use client";

import { useHotkeyRecorder } from "@tanstack/react-hotkeys";
import { useState } from "react";

import { setHotkeyRecording } from "@/components/keyboard/recording-gate.ts";
import { SettingsItemRow } from "@/components/settings/settings-item-card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ItemActions, ItemContent, ItemTitle } from "@/components/ui/item.tsx";
import { Kbd, KbdGroup } from "@/components/ui/kbd.tsx";
import { Shortcut } from "@/components/ui/shortcut.tsx";
import { formatHotkeyTokens } from "@/lib/settings/format-hotkey.ts";
import {
  getCommand,
  type KeyboardCommand,
  type SequenceCommand,
} from "@/lib/settings/keyboard-commands.ts";
import {
  clearKeybindingOverride,
  setKeybindingOverride,
} from "@/lib/settings/persist-keybinding.ts";
import {
  findConflict,
  type ResolvedKeybindings,
} from "@/lib/settings/use-keybindings.ts";

interface KeyboardShortcutRowProps {
  command: KeyboardCommand;
  resolved: ResolvedKeybindings;
}

/**
 * Read-only row for a fixed (non-customizable) shortcut — shows the label and
 * its binding without the recorder/Edit affordances. Used for caret-coupled and
 * native editor keys that can't be rebound but should still be discoverable.
 */
export function KeyboardShortcutStaticRow({
  command,
}: {
  command: KeyboardCommand;
}) {
  return (
    <SettingsItemRow>
      <ItemContent>
        <ItemTitle>{command.label}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Shortcut command={command.id} />
      </ItemActions>
    </SettingsItemRow>
  );
}

/**
 * Read-only row for a multi-step chord (e.g. press G then H). Each step renders
 * as its own keycap so the sequence reads left-to-right.
 */
export function KeyboardSequenceRow({
  sequence,
}: {
  sequence: SequenceCommand;
}) {
  return (
    <SettingsItemRow>
      <ItemContent>
        <ItemTitle>{sequence.label}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <KbdGroup>
          {sequence.sequence.map((step, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional chord steps
            <Kbd key={index}>{formatHotkeyTokens(step)[0] ?? step}</Kbd>
          ))}
        </KbdGroup>
      </ItemActions>
    </SettingsItemRow>
  );
}

/**
 * A rebindable shortcut row: shows the current binding and lets the user record
 * a new combo (Esc cancels, Backspace/Delete clears to default). Conflicts with
 * another command are rejected with an inline message. Command dispatch is
 * gated off globally while recording so the captured combo never fires.
 */
export function KeyboardShortcutRow({
  command,
  resolved,
}: KeyboardShortcutRowProps) {
  const [error, setError] = useState<string | null>(null);

  const recorder = useHotkeyRecorder({
    onRecord: (hotkey) => {
      const conflictId = findConflict(hotkey, resolved, command.id);
      if (conflictId) {
        setError(`Already used by "${getCommand(conflictId).label}"`);
        setHotkeyRecording(false);
        return;
      }
      setKeybindingOverride(command.id, hotkey);
      setError(null);
      setHotkeyRecording(false);
    },
    onCancel: () => setHotkeyRecording(false),
    onClear: () => {
      clearKeybindingOverride(command.id);
      setError(null);
      setHotkeyRecording(false);
    },
  });

  const startRecording = () => {
    setError(null);
    setHotkeyRecording(true);
    recorder.startRecording();
  };

  const cancelRecording = () => {
    recorder.cancelRecording();
    setHotkeyRecording(false);
  };

  const isOverridden = resolved[command.id] !== command.defaultHotkey;
  const previewTokens = recorder.recordedHotkey
    ? formatHotkeyTokens(recorder.recordedHotkey)
    : null;

  return (
    <SettingsItemRow>
      <ItemContent>
        <ItemTitle>{command.label}</ItemTitle>
        {error ? (
          <span className="text-destructive text-xs">{error}</span>
        ) : null}
      </ItemContent>
      <ItemActions>
        {recorder.isRecording ? (
          <>
            <span className="rounded-sm border border-ring border-dashed px-2 py-0.5 text-muted-foreground text-xs">
              {previewTokens ? (
                <KbdGroup>
                  {previewTokens.map((token, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: positional tokens
                    <Kbd key={index}>{token}</Kbd>
                  ))}
                </KbdGroup>
              ) : (
                "Press keys…"
              )}
            </span>
            <Button onClick={cancelRecording} size="xs" variant="ghost">
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Shortcut command={command.id} />
            {isOverridden ? (
              <Button
                onClick={() => clearKeybindingOverride(command.id)}
                size="xs"
                variant="ghost"
              >
                Reset
              </Button>
            ) : null}
            <Button onClick={startRecording} size="xs" variant="outline">
              Edit
            </Button>
          </>
        )}
      </ItemActions>
    </SettingsItemRow>
  );
}
