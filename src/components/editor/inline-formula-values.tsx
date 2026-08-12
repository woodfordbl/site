import { useEffect } from "react";

import { warmFormulaCodeEditor } from "@/components/database/preload-formula-code-editor.ts";
import { useInlineFormulaPage } from "@/components/editor/inline-formula-page.tsx";
import { useInlineFormulaValues } from "@/db/queries/use-inline-formula-values.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";

interface InlineFormulaValuesProps {
  marks: readonly InlineMark[];
  onValues: (values: ReadonlyMap<number, string>) => void;
}

/**
 * Reports a field's live token values upward. Exists as a component purely so
 * the subscription is conditional: {@link useInlineFormulaValues} reads the
 * workspace's databases and the user's functions, and a page of ordinary
 * paragraphs must not pay for that. The parent mounts this only when the
 * field's marks actually contain a token.
 *
 * Values are handed up rather than applied here so the parent can write them
 * after its own DOM rebuild — child layout effects run first, and a rebuild
 * replaces the very elements the values would have been written into.
 *
 * Mounting here is also the earliest honest signal that the CM6 formula
 * editor is REACHABLE — a token on screen is a token that can be clicked —
 * so this is where its chunk gets warmed. Without it the first click after a
 * reload opens on the fallback textarea, which spells the token's reference
 * `thisPage.Title` where the editor would chip it.
 */
export function InlineFormulaValues({
  marks,
  onValues,
}: InlineFormulaValuesProps) {
  const page = useInlineFormulaPage();
  const values = useInlineFormulaValues(page, marks);

  useEffect(() => {
    warmFormulaCodeEditor();
  }, []);

  useEffect(() => {
    onValues(values);
  }, [onValues, values]);

  return null;
}
