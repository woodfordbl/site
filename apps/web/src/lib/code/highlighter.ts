import { useEffect, useState, useSyncExternalStore } from "react";
import type { HighlighterCore } from "shiki/core";

import { DEFAULT_CODE_LANGUAGE } from "@/lib/code/code-languages.ts";
import {
  codeThemeStyleSheet,
  resolveCodeThemeColors,
  type ShikiThemeLike,
} from "@/lib/code/code-theme-colors.ts";
import {
  type CodeThemeDefinition,
  type CodeThemeId,
  codeTheme,
  DEFAULT_CODE_THEME_ID,
} from "@/lib/code/code-themes.ts";

/**
 * Shiki highlighter for the `code` block. Built with the fine-grained
 * `shiki/core` API and per-language dynamic imports so the bundle ships ONLY
 * the grammars listed below (the convenience `shiki` entry pulls in every
 * grammar — a ~1.25MB gzip chunk). Everything loads lazily, as a separate chunk
 * fetched when a code block first renders; until it resolves, `highlightToHtml`
 * returns escaped plain text and `useHighlighterReady` triggers a repaint.
 *
 * `defaultColor` is left at its default (`"light"`), so each token span carries a
 * baked light `color` plus a `--shiki-dark` CSS variable. `src/styles.css`
 * switches to the dark variable under `.dark` (see `.code-shiki` rules).
 *
 * The language imports below MUST stay in sync with `CODE_LANGUAGES` in
 * `code-languages.ts` (minus the no-op `plaintext` entry).
 */

/**
 * Static import map for every theme the curated registry can select. Static so
 * the bundler can code-split each one; they load on demand when selected, so
 * the default install still ships only the GitHub pair.
 */
const THEME_IMPORTS: Record<string, () => Promise<unknown>> = {
  "github-light": () => import("@shikijs/themes/github-light"),
  "github-dark": () => import("@shikijs/themes/github-dark"),
  "light-plus": () => import("@shikijs/themes/light-plus"),
  "dark-plus": () => import("@shikijs/themes/dark-plus"),
  "vitesse-light": () => import("@shikijs/themes/vitesse-light"),
  "vitesse-dark": () => import("@shikijs/themes/vitesse-dark"),
  "one-light": () => import("@shikijs/themes/one-light"),
  "one-dark-pro": () => import("@shikijs/themes/one-dark-pro"),
  "catppuccin-latte": () => import("@shikijs/themes/catppuccin-latte"),
  "catppuccin-mocha": () => import("@shikijs/themes/catppuccin-mocha"),
  "min-light": () => import("@shikijs/themes/min-light"),
  "min-dark": () => import("@shikijs/themes/min-dark"),
  "rose-pine-dawn": () => import("@shikijs/themes/rose-pine-dawn"),
  "rose-pine": () => import("@shikijs/themes/rose-pine"),
  "everforest-light": () => import("@shikijs/themes/everforest-light"),
  "everforest-dark": () => import("@shikijs/themes/everforest-dark"),
};

/** Id of the stylesheet publishing the formula editor's token variables. */
const THEME_STYLE_ELEMENT_ID = "code-theme-variables";

let activeTheme: CodeThemeDefinition = codeTheme(DEFAULT_CODE_THEME_ID);

/** The theme the app WANTS, set from appearance settings before any load. */
let desiredThemeId: CodeThemeId = DEFAULT_CODE_THEME_ID;

/** `light|dark` key of the pair whose variables are currently published. */
let publishedThemeKey: string | null = null;

/**
 * Bumped whenever the highlighter loads or the theme changes, so every code
 * block re-renders against the new colors ({@link useCodeThemeRevision}).
 */
let revision = 0;
const revisionListeners = new Set<() => void>();

function bumpRevision(): void {
  revision += 1;
  for (const listener of revisionListeners) {
    listener();
  }
}

let highlighter: HighlighterCore | null = null;
let loadPromise: Promise<HighlighterCore> | null = null;

function loadHighlighter(): Promise<HighlighterCore> {
  if (!loadPromise) {
    loadPromise = Promise.all([
      import("shiki/core"),
      import("shiki/engine/oniguruma"),
    ]).then(([core, oniguruma]) =>
      core.createHighlighterCore({
        themes: [
          import("@shikijs/themes/github-light"),
          import("@shikijs/themes/github-dark"),
        ],
        langs: [
          import("@shikijs/langs/typescript"),
          import("@shikijs/langs/tsx"),
          import("@shikijs/langs/javascript"),
          import("@shikijs/langs/jsx"),
          import("@shikijs/langs/json"),
          import("@shikijs/langs/html"),
          import("@shikijs/langs/css"),
          import("@shikijs/langs/python"),
          import("@shikijs/langs/bash"),
          import("@shikijs/langs/go"),
          import("@shikijs/langs/rust"),
          import("@shikijs/langs/sql"),
          import("@shikijs/langs/yaml"),
          import("@shikijs/langs/markdown"),
        ],
        engine: oniguruma.createOnigurumaEngine(import("shiki/wasm")),
      })
    );
    loadPromise = loadPromise.then(async (instance) => {
      highlighter = instance;
      // A non-default theme may have been selected before the highlighter
      // existed; register it so the first paint uses the right colors.
      await loadThemesInto(instance, desiredThemeId);
      bumpRevision();
      return instance;
    });
  }
  return loadPromise;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function resolveLang(language: string | undefined): string {
  if (!language || language === DEFAULT_CODE_LANGUAGE) {
    return DEFAULT_CODE_LANGUAGE;
  }
  return highlighter?.getLoadedLanguages().includes(language)
    ? language
    : DEFAULT_CODE_LANGUAGE;
}

/**
 * Synchronously render `code` to inline Shiki HTML (token `<span>`s with `<br>`
 * line breaks — no wrapping `<pre>`). Falls back to escaped plain text before
 * the highlighter has loaded. The caller supplies the `<pre>` wrapper.
 */
export function highlightToHtml(
  code: string,
  language: string | undefined
): string {
  if (!highlighter) {
    return escapeHtml(code);
  }
  return highlighter.codeToHtml(code, {
    lang: resolveLang(language),
    themes: { light: activeTheme.light, dark: activeTheme.dark },
    structure: "inline",
  });
}

/**
 * Publish the pair's resolved token colors as CSS variables. One stylesheet
 * carries both modes (`:root` + `.dark`), so the workspace theme toggle picks
 * between them with no further JS.
 */
function applyThemeVariables(
  light: ShikiThemeLike,
  dark: ShikiThemeLike
): void {
  if (typeof document === "undefined") {
    return;
  }
  let element = document.getElementById(THEME_STYLE_ELEMENT_ID);
  if (element === null) {
    element = document.createElement("style");
    element.id = THEME_STYLE_ELEMENT_ID;
    document.head.append(element);
  }
  element.textContent = codeThemeStyleSheet(
    resolveCodeThemeColors(light),
    resolveCodeThemeColors(dark)
  );
}

/** Unwrap a theme module (default export) to the raw theme object. */
function themeModuleValue(imported: unknown): ShikiThemeLike {
  const record = imported as { default?: ShikiThemeLike };
  return record.default ?? (imported as ShikiThemeLike);
}

/**
 * Switch every code surface to `id`: loads the pair into Shiki (so code blocks
 * repaint), resolves the formula editor's token variables from the same theme,
 * and notifies subscribers. Safe to call repeatedly — an unchanged id is a
 * no-op, and a failed load leaves the previous theme in place.
 */
export async function setCodeTheme(id: CodeThemeId): Promise<void> {
  desiredThemeId = id;
  // Variables first: this only needs the theme JSON, so the formula editor and
  // inline code get their colors without pulling Shiki's engine or grammars.
  await publishThemeVariables(id);
  // Code BLOCKS additionally need the themes registered with the highlighter,
  // but only once one has actually loaded it.
  if (highlighter !== null) {
    await loadThemesInto(highlighter, id);
  }
  bumpRevision();
}

/**
 * Resolve `id`'s pair from the theme JSON alone and publish the CSS variables.
 * Idempotent via {@link publishedThemeKey}, so the FIRST call still applies the
 * default theme rather than short-circuiting on an unchanged id.
 */
async function publishThemeVariables(id: CodeThemeId): Promise<void> {
  const next = codeTheme(id);
  const key = `${next.light}|${next.dark}`;
  if (key === publishedThemeKey) {
    return;
  }
  const [light, dark] = await Promise.all(
    [next.light, next.dark].map(async (name) => {
      const imported = await THEME_IMPORTS[name]?.();
      return imported === undefined ? undefined : themeModuleValue(imported);
    })
  );
  if (light === undefined || dark === undefined) {
    return;
  }
  activeTheme = next;
  publishedThemeKey = key;
  applyThemeVariables(light, dark);
}

/** Register `id`'s pair with the highlighter so `codeToHtml` can use it. */
async function loadThemesInto(
  instance: HighlighterCore,
  id: CodeThemeId
): Promise<void> {
  const next = codeTheme(id);
  const loaded = new Set(instance.getLoadedThemes());
  await Promise.all(
    [next.light, next.dark]
      .filter((name) => !loaded.has(name))
      .map(async (name) => {
        const imported = await THEME_IMPORTS[name]?.();
        if (imported !== undefined) {
          // biome-ignore lint/suspicious/noExplicitAny: shiki's loadTheme input type is not exported.
          await instance.loadTheme(themeModuleValue(imported) as any);
        }
      })
  );
}

/**
 * Re-renders the caller whenever the highlighter finishes loading or the code
 * theme changes. Code surfaces read this alongside their own state so a theme
 * switch repaints them immediately.
 */
export function useCodeThemeRevision(): number {
  return useSyncExternalStore(
    (listener) => {
      revisionListeners.add(listener);
      return () => revisionListeners.delete(listener);
    },
    () => revision,
    () => 0
  );
}

/** Loads the Shiki highlighter once and re-renders the caller when it is ready. */
export function useHighlighterReady(): boolean {
  const [ready, setReady] = useState(() => highlighter !== null);

  useEffect(() => {
    if (highlighter) {
      return;
    }
    let active = true;
    loadHighlighter()
      .then(() => {
        if (active) {
          setReady(true);
        }
      })
      .catch(() => {
        // Highlighting is non-essential; plain text remains rendered.
      });
    return () => {
      active = false;
    };
  }, []);

  return ready;
}
