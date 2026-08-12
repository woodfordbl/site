import { useEffect } from "react";

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
 */
export function InlineFormulaValues({
  marks,
  onValues,
}: InlineFormulaValuesProps) {
  const page = useInlineFormulaPage();
  const values = useInlineFormulaValues(page, marks);

  useEffect(() => {
    onValues(values);
  }, [onValues, values]);

  return null;
}
