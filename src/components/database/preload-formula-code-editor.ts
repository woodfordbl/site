import type { ComponentType } from "react";

import type { FormulaCodeEditorProps } from "@/components/database/formula-code-editor.tsx";

/**
 * Warms the code-split CM6 formula editor (~85 KB gz), the same pattern as
 * `preload-page-icon-picker.ts`.
 *
 * Worth warming eagerly because of what the cold path looks like: until the
 * chunk lands, {@link FormulaEditorPanel} falls back to the plain textarea,
 * and the textarea shows the HUMANIZED expression — `thisPage.Title`, not the
 * labeled chip the CM6 editor draws over the same reference. So a cold chunk
 * isn't a blank box the eye skips; it's the formula briefly spelled a
 * different way, which reads as the editor changing its mind. Surfaces that
 * can open the editor therefore warm it as soon as they know it's REACHABLE —
 * `InlineFormulaValues` mounts iff a field holds a token, which is exactly
 * the population that can be clicked into the editor.
 *
 * Freshly INSERTED tokens need no warm: their expression is empty, so the
 * stand-in has nothing to spell differently, and by the time one has content
 * the chunk is long since in.
 *
 * A page with no formulas still pays nothing — nothing on it warms the chunk.
 */

/** In-flight/settled import, so concurrent callers share one fetch. */
let editorPromise: Promise<ComponentType<FormulaCodeEditorProps>> | null = null;

/** Resolved component, for the synchronous {@link loadedFormulaCodeEditor}. */
let loadedEditor: ComponentType<FormulaCodeEditorProps> | null = null;

/**
 * Warms the chunk and resolves to the editor component. Store the result with
 * a functional updater — `setEditor(() => component)` — not `.then(setEditor)`,
 * or React will call the component as a state initializer.
 */
export function preloadFormulaCodeEditor(): Promise<
  ComponentType<FormulaCodeEditorProps>
> {
  editorPromise ??= import(
    "@/components/database/formula-code-editor.tsx"
  ).then((module) => {
    loadedEditor = module.FormulaCodeEditor;
    return loadedEditor;
  });
  return editorPromise;
}

/**
 * The editor component if the chunk is already in hand, else null.
 *
 * This is what makes a warmed chunk actually pay off: a panel seeds its state
 * from here and mounts CM6 on its FIRST render. Suspending on an
 * already-resolved import would still commit the fallback textarea for a
 * frame — a visible flash of `thisPage.Title` where a chip belongs.
 */
export function loadedFormulaCodeEditor(): ComponentType<FormulaCodeEditorProps> | null {
  return loadedEditor;
}

/** Fire-and-forget warm, for callers with no use for the component itself. */
export function warmFormulaCodeEditor(): void {
  preloadFormulaCodeEditor().catch(() => {
    // Best-effort: a failed warm just means the panel loads it on open, and
    // the panel's own error boundary owns the permanent-failure case.
  });
}
