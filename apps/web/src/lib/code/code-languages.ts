/**
 * Curated language list for the `code` block. Kept free of any Shiki import so
 * `block-defs.ts` (and other schema-layer code) can reference the default
 * without pulling the highlighter bundle. `id` values are Shiki language ids.
 */

export interface CodeLanguage {
  id: string;
  label: string;
}

/** Shiki treats this as a no-op grammar; tokens inherit the container color. */
export const DEFAULT_CODE_LANGUAGE = "plaintext";

export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  { id: "plaintext", label: "Plain text" },
  { id: "typescript", label: "TypeScript" },
  { id: "tsx", label: "TSX" },
  { id: "javascript", label: "JavaScript" },
  { id: "jsx", label: "JSX" },
  { id: "json", label: "JSON" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "python", label: "Python" },
  { id: "bash", label: "Shell" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "sql", label: "SQL" },
  { id: "yaml", label: "YAML" },
  { id: "markdown", label: "Markdown" },
] as const;

export function codeLanguageLabel(id: string | undefined): string {
  return (
    CODE_LANGUAGES.find((language) => language.id === id)?.label ?? "Plain text"
  );
}
