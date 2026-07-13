import type { Hotkey } from "@tanstack/react-hotkeys";

/**
 * Single source of truth for every keyboard shortcut in the app.
 *
 * Each command carries its default combo (TanStack Hotkeys syntax), where it is
 * dispatched, and whether users may rebind it. Display strings are derived from
 * the resolved combo via `format-hotkey.ts` — never hand-written.
 */

export type CommandId =
  // Navigation
  | "toggle-sidebar"
  | "open-settings"
  | "show-shortcuts"
  | "back-to-app"
  // Pages
  | "new-page"
  | "new-subpage"
  | "duplicate-page"
  | "delete-page"
  | "edit-template"
  | "save-as-template"
  | "toggle-favorite"
  | "copy-page-link"
  | "next-page"
  | "prev-page"
  // Appearance
  | "toggle-theme"
  | "toggle-full-width"
  | "add-cover"
  // Canvas clipboard
  | "select-all-blocks"
  | "copy-blocks"
  | "paste-blocks"
  | "duplicate-block"
  // Canvas blocks (dispatched)
  | "undo-edit"
  | "redo-edit"
  | "move-row-up"
  | "move-row-down"
  | "move-selected-row-up"
  | "move-selected-row-down"
  | "extend-selection-up"
  | "extend-selection-down"
  | "clear-selection"
  // Canvas blocks (native / caret-coupled, locked)
  | "split-block"
  | "newline-in-block"
  | "delete-block"
  // Canvas table (native, active in a focused cell)
  | "table-add-row"
  | "table-add-column"
  | "table-delete-row"
  | "table-delete-column"
  | "table-move-row-up"
  | "table-move-row-down"
  | "table-move-column-left"
  | "table-move-column-right"
  // Slash menu (native, locked)
  | "slash-open"
  | "slash-prev"
  | "slash-next"
  | "slash-confirm"
  | "slash-dismiss";

export type CommandGroup =
  | "Navigation"
  | "Pages"
  | "Appearance"
  | "Canvas blocks"
  | "Canvas table"
  | "Canvas clipboard"
  | "Slash menu";

/**
 * Where a command is registered.
 * - `global`  → app root via {@link useCommandHotkeys} (e.g. toggle sidebar).
 * - `canvas`  → page canvas editor via {@link useCommandHotkeys}, scoped to the canvas.
 * - `field`   → matched natively inside the editor key handlers (caret-coupled or
 *               typing-driven; see field-keydown.ts / editable-surface.tsx); never
 *               dispatched by TanStack. Listed for display only, with the
 *               keyboard-commands.test.ts drift guard pinning the combos in sync.
 */
export type CommandScope = "global" | "canvas" | "field";

export interface KeyboardCommand {
  /** Additional combos that also trigger this command (e.g. Delete alongside Backspace). */
  aliases?: Hotkey[];
  /** Whether users may rebind this command in settings. */
  customizable: boolean;
  /** Default combo in TanStack Hotkeys syntax (e.g. "Mod+B", "Alt+ArrowUp"). */
  defaultHotkey: Hotkey;
  /**
   * Display-only: not an actual dispatched/matched hotkey, just documented in
   * settings (e.g. typing "/" to open the slash menu).
   */
  displayOnly?: boolean;
  group: CommandGroup;
  id: CommandId;
  /**
   * Override TanStack's per-hotkey `ignoreInputs` default. Leave unset to inherit
   * the library's heuristic (single keys + Shift/Alt combos ignore inputs; Ctrl/
   * Meta/Escape do not). Set `true` to keep a combo from firing while a text field
   * is focused (e.g. Escape that should only clear block selection outside fields).
   */
  ignoreInputs?: boolean;
  /** Human-readable name shown in settings. */
  label: string;
  /**
   * Override TanStack's `preventDefault` default (true). Set false for keys whose
   * native handler decides whether to consume the event. Ignored for `field` scope.
   */
  preventDefault?: boolean;
  scope: CommandScope;
}

/** Group ordering for the settings panel. */
export const COMMAND_GROUPS: CommandGroup[] = [
  "Navigation",
  "Pages",
  "Appearance",
  "Canvas blocks",
  "Canvas table",
  "Canvas clipboard",
  "Slash menu",
];

export const KEYBOARD_COMMANDS: KeyboardCommand[] = [
  // ── Navigation ───────────────────────────────────────────────────────────
  {
    id: "toggle-sidebar",
    label: "Toggle sidebar",
    group: "Navigation",
    defaultHotkey: "Mod+B",
    customizable: true,
    scope: "global",
    // Mod+B is Bold inside a text field — let the editor own it while typing so
    // toggling the sidebar never fights the inline formatting shortcut.
    ignoreInputs: true,
  },
  {
    id: "open-settings",
    label: "Open settings",
    group: "Navigation",
    defaultHotkey: "Mod+,",
    customizable: true,
    scope: "global",
  },
  {
    id: "show-shortcuts",
    label: "Show keyboard shortcuts",
    group: "Navigation",
    defaultHotkey: "Mod+/",
    customizable: true,
    scope: "global",
  },
  {
    id: "back-to-app",
    label: "Back to app (close settings)",
    group: "Navigation",
    defaultHotkey: "Mod+Escape",
    customizable: true,
    scope: "global",
  },

  // ── Pages ────────────────────────────────────────────────────────────────
  {
    id: "new-page",
    label: "New page",
    group: "Pages",
    defaultHotkey: "C",
    customizable: true,
    scope: "global",
  },
  {
    id: "new-subpage",
    label: "New sub-page",
    group: "Pages",
    defaultHotkey: "Shift+C",
    customizable: true,
    scope: "global",
  },
  {
    id: "duplicate-page",
    label: "Duplicate page",
    group: "Pages",
    defaultHotkey: "Mod+Shift+D",
    customizable: true,
    scope: "global",
    ignoreInputs: true,
  },
  {
    id: "delete-page",
    label: "Delete page",
    group: "Pages",
    defaultHotkey: "D",
    customizable: true,
    scope: "global",
    ignoreInputs: true,
  },
  {
    id: "edit-template",
    label: "Edit page template",
    group: "Pages",
    defaultHotkey: "S",
    customizable: true,
    scope: "global",
  },
  {
    id: "save-as-template",
    label: "Save page as template",
    group: "Pages",
    defaultHotkey: "Mod+Shift+T",
    customizable: true,
    scope: "global",
    ignoreInputs: true,
  },
  {
    id: "toggle-favorite",
    label: "Toggle favorite",
    group: "Pages",
    defaultHotkey: "F",
    customizable: true,
    scope: "global",
    ignoreInputs: true,
  },
  {
    id: "copy-page-link",
    label: "Copy link to page",
    group: "Pages",
    defaultHotkey: "Mod+Shift+C",
    customizable: true,
    scope: "global",
    ignoreInputs: true,
  },
  {
    id: "next-page",
    label: "Next page",
    group: "Pages",
    defaultHotkey: "Mod+Alt+ArrowDown",
    customizable: true,
    scope: "global",
  },
  {
    id: "prev-page",
    label: "Previous page",
    group: "Pages",
    defaultHotkey: "Mod+Alt+ArrowUp",
    customizable: true,
    scope: "global",
  },

  // ── Appearance ───────────────────────────────────────────────────────────
  {
    id: "toggle-theme",
    label: "Toggle dark / light theme",
    group: "Appearance",
    defaultHotkey: "Mod+Shift+L",
    customizable: true,
    scope: "global",
  },
  {
    id: "toggle-full-width",
    label: "Toggle full-width page",
    group: "Appearance",
    defaultHotkey: "Mod+Shift+F",
    customizable: true,
    scope: "global",
  },
  {
    id: "add-cover",
    label: "Add or change cover",
    group: "Appearance",
    defaultHotkey: "Mod+Shift+O",
    customizable: true,
    scope: "global",
  },

  // ── Canvas blocks ──────────────────────────────────────────────────────
  {
    id: "undo-edit",
    label: "Undo edit",
    group: "Canvas blocks",
    defaultHotkey: "Mod+Z",
    customizable: false,
    scope: "canvas",
    // The handler decides whether it owns the event: inside canvas fields it
    // preventDefaults (native undo is broken on controlled inputs anyway), but
    // in unrelated inputs (dialogs, search) the browser default must survive.
    preventDefault: false,
  },
  {
    id: "redo-edit",
    label: "Redo edit",
    group: "Canvas blocks",
    defaultHotkey: "Mod+Shift+Z",
    aliases: ["Mod+Y"],
    customizable: false,
    scope: "canvas",
    preventDefault: false,
  },
  {
    id: "split-block",
    label: "Split block at caret",
    group: "Canvas blocks",
    defaultHotkey: "Enter",
    customizable: false,
    scope: "field",
  },
  {
    id: "newline-in-block",
    label: "New line in multiline block",
    group: "Canvas blocks",
    defaultHotkey: "Shift+Enter",
    customizable: false,
    scope: "field",
  },
  {
    id: "delete-block",
    label: "Delete empty block or selected blocks",
    group: "Canvas blocks",
    defaultHotkey: "Backspace",
    aliases: ["Delete"],
    customizable: false,
    scope: "field",
  },

  // ── Canvas table ───────────────────────────────────────────────────────
  // Matched natively inside a focused table cell (see table-cell-shortcuts.ts);
  // the registry pins them for the shortcuts panel. On the `=`/`-` insert/delete
  // keys, Alt is the base and Mod flips the axis to column (Shift+punctuation is
  // layout-dependent and rejected by the Hotkey type, and Mod+=/Mod+- collide
  // with browser zoom). Moves use Alt+Shift+arrows.
  {
    id: "table-add-row",
    label: "Add row below",
    group: "Canvas table",
    defaultHotkey: "Alt+=",
    customizable: false,
    scope: "field",
  },
  {
    id: "table-add-column",
    label: "Add column to the right",
    group: "Canvas table",
    defaultHotkey: "Mod+Alt+=",
    customizable: false,
    scope: "field",
  },
  {
    id: "table-delete-row",
    label: "Delete row",
    group: "Canvas table",
    defaultHotkey: "Alt+-",
    customizable: false,
    scope: "field",
  },
  {
    id: "table-delete-column",
    label: "Delete column",
    group: "Canvas table",
    defaultHotkey: "Mod+Alt+-",
    customizable: false,
    scope: "field",
  },
  {
    id: "table-move-row-up",
    label: "Move row up",
    group: "Canvas table",
    defaultHotkey: "Alt+Shift+ArrowUp",
    customizable: false,
    scope: "field",
  },
  {
    id: "table-move-row-down",
    label: "Move row down",
    group: "Canvas table",
    defaultHotkey: "Alt+Shift+ArrowDown",
    customizable: false,
    scope: "field",
  },
  {
    id: "table-move-column-left",
    label: "Move column left",
    group: "Canvas table",
    defaultHotkey: "Alt+Shift+ArrowLeft",
    customizable: false,
    scope: "field",
  },
  {
    id: "table-move-column-right",
    label: "Move column right",
    group: "Canvas table",
    defaultHotkey: "Alt+Shift+ArrowRight",
    customizable: false,
    scope: "field",
  },
  // Move/extend have a second, caret-coupled entry point inside focused fields
  // (see field-keydown.ts), so they stay fixed but are registry-centralized.
  {
    id: "move-row-up",
    label: "Move focused row up",
    group: "Canvas blocks",
    defaultHotkey: "Alt+ArrowUp",
    customizable: false,
    scope: "canvas",
  },
  {
    id: "move-row-down",
    label: "Move focused row down",
    group: "Canvas blocks",
    defaultHotkey: "Alt+ArrowDown",
    customizable: false,
    scope: "canvas",
  },
  {
    id: "move-selected-row-up",
    label: "Move selected row up",
    group: "Canvas blocks",
    defaultHotkey: "Mod+ArrowUp",
    customizable: false,
    scope: "canvas",
  },
  {
    id: "move-selected-row-down",
    label: "Move selected row down",
    group: "Canvas blocks",
    defaultHotkey: "Mod+ArrowDown",
    customizable: false,
    scope: "canvas",
  },
  {
    id: "extend-selection-up",
    label: "Extend selection up",
    group: "Canvas blocks",
    defaultHotkey: "Shift+ArrowUp",
    customizable: false,
    scope: "canvas",
  },
  {
    id: "extend-selection-down",
    label: "Extend selection down",
    group: "Canvas blocks",
    defaultHotkey: "Shift+ArrowDown",
    customizable: false,
    scope: "canvas",
  },
  {
    id: "clear-selection",
    label: "Clear block selection",
    group: "Canvas blocks",
    defaultHotkey: "Escape",
    customizable: false,
    scope: "canvas",
    // Only act on block selection when no field is focused; otherwise Escape
    // belongs to the slash menu / inline rename handlers.
    ignoreInputs: true,
  },

  // ── Canvas clipboard ───────────────────────────────────────────────────
  {
    id: "select-all-blocks",
    label: "Select all blocks",
    group: "Canvas clipboard",
    defaultHotkey: "Mod+A",
    customizable: true,
    scope: "canvas",
    // Only select blocks when not editing text; inside a field Mod+A selects text.
    ignoreInputs: true,
  },
  {
    id: "copy-blocks",
    label: "Copy selected blocks",
    group: "Canvas clipboard",
    defaultHotkey: "Mod+C",
    customizable: true,
    scope: "canvas",
    // Only copy blocks when not editing text; inside a field Mod+C copies text.
    ignoreInputs: true,
  },
  {
    // Driven by the native `paste` ClipboardEvent (not a keydown), so it is not
    // dispatched through useCommandHotkeys and cannot be rebound.
    id: "paste-blocks",
    label: "Paste blocks",
    group: "Canvas clipboard",
    defaultHotkey: "Mod+V",
    customizable: false,
    scope: "canvas",
  },
  {
    id: "duplicate-block",
    label: "Duplicate block",
    group: "Canvas clipboard",
    defaultHotkey: "Mod+D",
    customizable: false,
    scope: "canvas",
    // Field-level duplicate is handled in editable-surface.tsx; this covers
    // block selection when no canvas field is focused.
    ignoreInputs: true,
  },

  // ── Slash menu ───────────────────────────────────────────────────────────
  {
    id: "slash-open",
    label: "Open slash menu while typing",
    group: "Slash menu",
    defaultHotkey: "/",
    customizable: false,
    scope: "field",
    displayOnly: true,
  },
  {
    id: "slash-prev",
    label: "Highlight previous item",
    group: "Slash menu",
    defaultHotkey: "ArrowUp",
    customizable: false,
    scope: "field",
  },
  {
    id: "slash-next",
    label: "Highlight next item",
    group: "Slash menu",
    defaultHotkey: "ArrowDown",
    customizable: false,
    scope: "field",
  },
  {
    id: "slash-confirm",
    label: "Confirm selection",
    group: "Slash menu",
    defaultHotkey: "Enter",
    customizable: false,
    scope: "field",
  },
  {
    id: "slash-dismiss",
    label: "Dismiss menu",
    group: "Slash menu",
    defaultHotkey: "Escape",
    customizable: false,
    scope: "field",
  },
];

const COMMAND_BY_ID = new Map<CommandId, KeyboardCommand>(
  KEYBOARD_COMMANDS.map((command) => [command.id, command])
);

export function getCommand(id: CommandId): KeyboardCommand {
  const command = COMMAND_BY_ID.get(id);
  if (!command) {
    throw new Error(`Unknown keyboard command: ${id}`);
  }
  return command;
}

/** Commands belonging to a group, in registry (display) order. */
export function getCommandsInGroup(group: CommandGroup): KeyboardCommand[] {
  return KEYBOARD_COMMANDS.filter((command) => command.group === group);
}

/**
 * Vim-style chord (sequence) commands, e.g. press `G` then `H`. These are
 * dispatched via {@link useCommandSequences} (TanStack's sequence hooks) rather
 * than the single-combo path, and are fixed (not rebindable) for now — the
 * single-combo recorder can't capture multi-step chords.
 */
export type SequenceCommandId = "go-home" | "go-settings" | "go-shortcuts";

export interface SequenceCommand {
  id: SequenceCommandId;
  label: string;
  /** Chord steps, each a single key (e.g. ["G", "H"] → press G then H). */
  sequence: Hotkey[];
}

/** Display group for chord commands in the settings panel. */
export const SEQUENCE_GROUP = "Go to";

export const KEYBOARD_SEQUENCES: SequenceCommand[] = [
  { id: "go-home", label: "Go to home", sequence: ["G", "H"] },
  { id: "go-settings", label: "Go to settings", sequence: ["G", "S"] },
  {
    id: "go-shortcuts",
    label: "Go to keyboard shortcuts",
    sequence: ["G", "K"],
  },
];

/** Lookup a fixed char + char chord command by id. */
export function getSequenceCommand(id: SequenceCommandId): SequenceCommand {
  const command = KEYBOARD_SEQUENCES.find((entry) => entry.id === id);
  if (!command) {
    throw new Error(`Unknown sequence command: ${id}`);
  }
  return command;
}
