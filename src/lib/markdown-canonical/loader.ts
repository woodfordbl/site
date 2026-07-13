import type { parsePageMarkdown } from "./parse-page.ts";
import type {
  serializeBlocksMarkdown,
  serializePageMarkdown,
} from "./serialize-page.ts";

/**
 * Lazy client façade for the canonical codec, mirroring the Shiki pattern in
 * `src/lib/code/highlighter.ts`: the remark pipeline loads as its own chunk
 * the first time a browser flow (import, paste, copy-as-markdown) needs it.
 * Server code imports `parse-page.ts` / `serialize-page.ts` directly.
 */

export interface MarkdownCodec {
  parsePageMarkdown: typeof parsePageMarkdown;
  serializeBlocksMarkdown: typeof serializeBlocksMarkdown;
  serializePageMarkdown: typeof serializePageMarkdown;
}

let loadPromise: Promise<MarkdownCodec> | null = null;

export function loadMarkdownCodec(): Promise<MarkdownCodec> {
  if (!loadPromise) {
    loadPromise = Promise.all([
      import("./parse-page.ts"),
      import("./serialize-page.ts"),
    ]).then(([parseModule, serializeModule]) => ({
      parsePageMarkdown: parseModule.parsePageMarkdown,
      serializeBlocksMarkdown: serializeModule.serializeBlocksMarkdown,
      serializePageMarkdown: serializeModule.serializePageMarkdown,
    }));
  }
  return loadPromise;
}
