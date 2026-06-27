import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import {
  codeLanguageLabel,
  DEFAULT_CODE_LANGUAGE,
} from "@/lib/code/code-languages.ts";
import {
  highlightToHtml,
  useHighlighterReady,
} from "@/lib/code/highlighter.ts";

type CodeViewProps = BlockViewProps<"code">;

export function CodeView({ props }: CodeViewProps) {
  // Repaint once the async Shiki highlighter resolves.
  useHighlighterReady();
  const language = props.language ?? DEFAULT_CODE_LANGUAGE;
  const html = highlightToHtml(props.text, language);

  return (
    <div className="relative rounded-md bg-muted">
      <span className="pointer-events-none absolute top-2 right-3 select-none text-muted-foreground text-xs">
        {codeLanguageLabel(language)}
      </span>
      <pre className="code-shiki overflow-x-auto whitespace-pre-wrap break-words px-4 py-3 pr-20 text-sm leading-6">
        {/* Shiki emits sanitized token markup (token <span>s + <br> line breaks). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki highlighter output */}
        <code dangerouslySetInnerHTML={{ __html: html || " " }} />
      </pre>
    </div>
  );
}
