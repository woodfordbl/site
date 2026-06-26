export interface KeyboardShortcutEntry {
  description: string;
  keys: string[];
}

export interface KeyboardShortcutGroup {
  label: string;
  shortcuts: KeyboardShortcutEntry[];
}

export const KEYBOARD_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    label: "Navigation",
    shortcuts: [
      {
        keys: ["⌘", "B"],
        description: "Toggle sidebar",
      },
    ],
  },
  {
    label: "Canvas — blocks",
    shortcuts: [
      { keys: ["Enter"], description: "Split block at caret" },
      { keys: ["Shift", "Enter"], description: "New line in multiline block" },
      {
        keys: ["Backspace"],
        description: "Delete empty block or selected blocks",
      },
      {
        keys: ["Delete"],
        description: "Delete empty block or selected blocks",
      },
      { keys: ["⌥", "↑"], description: "Move focused row up" },
      { keys: ["⌥", "↓"], description: "Move focused row down" },
      { keys: ["Shift", "↑"], description: "Extend selection up" },
      { keys: ["Shift", "↓"], description: "Extend selection down" },
    ],
  },
  {
    label: "Canvas — clipboard",
    shortcuts: [
      { keys: ["⌘", "A"], description: "Select all blocks" },
      { keys: ["⌘", "C"], description: "Copy selected blocks" },
      { keys: ["⌘", "V"], description: "Paste blocks" },
    ],
  },
  {
    label: "Gutter",
    shortcuts: [
      { keys: ["+"], description: "Click insert after row" },
      { keys: ["⌥", "+"], description: "Option-click insert before row" },
    ],
  },
  {
    label: "Slash menu",
    shortcuts: [
      { keys: ["/"], description: "Open slash menu while typing" },
      { keys: ["↑"], description: "Highlight previous item" },
      { keys: ["↓"], description: "Highlight next item" },
      { keys: ["Enter"], description: "Confirm selection" },
      { keys: ["Esc"], description: "Dismiss menu" },
    ],
  },
];
