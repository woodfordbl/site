import { normalizeHotkey, validateHotkey } from "@tanstack/react-hotkeys";
import { describe, expect, it } from "vitest";

import {
  type CommandId,
  getCommand,
  KEYBOARD_COMMANDS,
} from "@/lib/settings/keyboard-commands.ts";

const ALL_IDS: CommandId[] = KEYBOARD_COMMANDS.map((command) => command.id);

describe("keyboard command registry", () => {
  it("has no duplicate command ids", () => {
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
  });

  it("only defines valid hotkey strings", () => {
    for (const command of KEYBOARD_COMMANDS) {
      for (const hotkey of [
        command.defaultHotkey,
        ...(command.aliases ?? []),
      ]) {
        expect(validateHotkey(hotkey).valid, `${command.id} → ${hotkey}`).toBe(
          true
        );
      }
    }
  });

  it("keeps user-rebindable defaults free of collisions", () => {
    // The customizable set all dispatch globally/at the canvas without an
    // ignoreInputs field-guard difference, so their defaults must be distinct.
    const customizable = KEYBOARD_COMMANDS.filter(
      (command) => command.customizable
    );
    const combos = customizable.map((command) =>
      normalizeHotkey(command.defaultHotkey)
    );
    expect(new Set(combos).size, combos.join(", ")).toBe(combos.length);
  });

  /**
   * Drift guard: the caret-coupled / native editor keys keep their literal
   * matching inside editable-surface.tsx and field-keydown.ts (TanStack's exact
   * modifier matching can't reproduce their lenient, caret-aware behavior). This
   * pins the registry's displayed combos to what those handlers actually
   * implement — change one, change both.
   */
  it("registry defaults match the native editor key implementation", () => {
    const expected: Record<string, string> = {
      "split-block": "Enter",
      "newline-in-block": "Shift+Enter",
      "delete-block": "Backspace",
      "slash-open": "/",
      "slash-prev": "ArrowUp",
      "slash-next": "ArrowDown",
      "slash-confirm": "Enter",
      "slash-dismiss": "Escape",
      "move-row-up": "Alt+ArrowUp",
      "move-row-down": "Alt+ArrowDown",
      "extend-selection-up": "Shift+ArrowUp",
      "extend-selection-down": "Shift+ArrowDown",
      "clear-selection": "Escape",
    };

    for (const [id, combo] of Object.entries(expected)) {
      expect(getCommand(id as CommandId).defaultHotkey).toBe(combo);
    }

    // delete-block also responds to Delete (handled in field-keydown.ts).
    expect(getCommand("delete-block").aliases).toContain("Delete");
  });
});
