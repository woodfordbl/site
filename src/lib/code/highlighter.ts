import { useEffect, useState } from "react";
import type { HighlighterCore } from "shiki/core";

import { DEFAULT_CODE_LANGUAGE } from "@/lib/code/code-languages.ts";

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

const LIGHT_THEME = "github-light";
const DARK_THEME = "github-dark";

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
    loadPromise = loadPromise.then((instance) => {
      highlighter = instance;
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
    themes: { light: LIGHT_THEME, dark: DARK_THEME },
    structure: "inline",
  });
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
