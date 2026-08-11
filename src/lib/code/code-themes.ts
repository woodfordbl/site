/**
 * Curated syntax themes, shared by every surface that shows code: fenced code
 * blocks (Shiki), the formula editor (own tokenizer, colors resolved from the
 * same theme — see `code-theme-colors.ts`), and inline code.
 *
 * Each entry is a LIGHT/DARK pair so the workspace theme switch recolors code
 * without a second setting. Ids are stable — they persist in site appearance —
 * while labels are free to change. Shiki bundles all of these already; they
 * load on demand, so adding an entry costs nothing until it is selected.
 */

export const CODE_THEME_IDS = [
  "github",
  "vscode",
  "vitesse",
  "one",
  "catppuccin",
  "min",
  "rose-pine",
  "everforest",
] as const;

export type CodeThemeId = (typeof CODE_THEME_IDS)[number];

export interface CodeThemeDefinition {
  /** Shiki theme id used in dark mode. */
  readonly dark: string;
  /** Shown under the label in the settings picker. */
  readonly description: string;
  readonly label: string;
  /** Shiki theme id used in light mode. */
  readonly light: string;
}

export const CODE_THEMES: Record<CodeThemeId, CodeThemeDefinition> = {
  github: {
    label: "GitHub",
    description: "The default — familiar, high contrast.",
    light: "github-light",
    dark: "github-dark",
  },
  vscode: {
    // Cursor is a VS Code fork and ships these as its defaults, so this is
    // the "Cursor light/dark" people mean.
    label: "VS Code / Cursor",
    description: "The editor defaults (Light+ and Dark+).",
    light: "light-plus",
    dark: "dark-plus",
  },
  vitesse: {
    label: "Vitesse",
    description: "Muted and low contrast, easy on long sessions.",
    light: "vitesse-light",
    dark: "vitesse-dark",
  },
  one: {
    label: "One",
    description: "Atom's One Light and One Dark Pro.",
    light: "one-light",
    dark: "one-dark-pro",
  },
  catppuccin: {
    label: "Catppuccin",
    description: "Soft pastels — Latte and Mocha.",
    light: "catppuccin-latte",
    dark: "catppuccin-mocha",
  },
  min: {
    label: "Min",
    description: "Minimal: few colors, mostly weight and grey.",
    light: "min-light",
    dark: "min-dark",
  },
  "rose-pine": {
    label: "Rosé Pine",
    description: "Warm and muted — Dawn and the dark original.",
    light: "rose-pine-dawn",
    dark: "rose-pine",
  },
  everforest: {
    label: "Everforest",
    description: "Green-leaning and desaturated.",
    light: "everforest-light",
    dark: "everforest-dark",
  },
};

export const DEFAULT_CODE_THEME_ID: CodeThemeId = "github";

export function codeThemeIds(): readonly CodeThemeId[] {
  return CODE_THEME_IDS;
}

/** The definition for `id`, falling back to the default for unknown ids. */
export function codeTheme(id: string | undefined): CodeThemeDefinition {
  return CODE_THEMES[id as CodeThemeId] ?? CODE_THEMES[DEFAULT_CODE_THEME_ID];
}

/**
 * Every Shiki theme name the registry can ask for, so the highlighter can
 * validate a requested theme without importing the whole map.
 */
export function codeThemeShikiNames(): readonly string[] {
  return Object.values(CODE_THEMES).flatMap((entry) => [
    entry.light,
    entry.dark,
  ]);
}
