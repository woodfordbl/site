import { IconChevronDown } from "@tabler/icons-react";
import { type KeyboardEvent, useCallback, useRef } from "react";
import EditorImport from "react-simple-code-editor";

import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import {
  CODE_LANGUAGES,
  codeLanguageLabel,
  DEFAULT_CODE_LANGUAGE,
} from "@/lib/code/code-languages.ts";
import {
  highlightToHtml,
  useHighlighterReady,
} from "@/lib/code/highlighter.ts";
import {
  handleBlockArrowKeyDown,
  handleBlockModifierArrowKeyDown,
  resolveStructuralDeleteKey,
} from "@/lib/editor/field-keydown.ts";

// react-simple-code-editor ships CommonJS; under some bundler interop paths the
// default import resolves to the module namespace ({ default: Editor }) rather
// than the component itself. Normalize so we always render the component.
const Editor =
  (EditorImport as unknown as { default?: typeof EditorImport }).default ??
  EditorImport;

type CodeEditProps = BlockEditProps<"code">;

export function CodeEdit({
  autoFocus,
  onAutoFocusHandled,
  onChange,
  props,
  onExtendSelectionDown,
  onExtendSelectionUp,
  onMoveRowDown,
  onMoveRowUp,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
}: CodeEditProps) {
  // Repaint once the async Shiki highlighter resolves.
  useHighlighterReady();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const language = props.language ?? DEFAULT_CODE_LANGUAGE;
  const isEmpty = props.text.trim().length === 0;

  const applyAutoFocus = useCallback(() => {
    wrapperRef.current?.querySelector("textarea")?.focus();
  }, []);

  useAutoFocus({
    enabled: autoFocus,
    onFocus: applyAutoFocus,
    onHandled: onAutoFocusHandled,
  });

  // Arrows/Backspace must stay with the textarea for editing; only escape the
  // block at the first/last line or delete it from an empty/caret-start state.
  // RSCE handles Tab (insert spaces) and Enter (newline, never splits the row).
  // The param is widened to HTMLElement so it satisfies RSCE's onKeyDown type
  // (a div/textarea handler intersection); at runtime it is always the textarea.
  const handleKeyDown = useCallback(
    (domEvent: KeyboardEvent<HTMLElement>) => {
      const event = domEvent as KeyboardEvent<HTMLTextAreaElement>;
      if (
        handleBlockModifierArrowKeyDown(event, {
          onExtendSelectionDown,
          onExtendSelectionUp,
          onMoveRowDown,
          onMoveRowUp,
        })
      ) {
        return;
      }
      if (handleBlockArrowKeyDown(event, { onNavigateDown, onNavigateUp })) {
        return;
      }
      const structural = resolveStructuralDeleteKey(event, isEmpty);
      if (structural.handled) {
        event.preventDefault();
        onStructuralKey?.(structural.caretAtStart, structural.key);
      }
    },
    [
      isEmpty,
      onExtendSelectionDown,
      onExtendSelectionUp,
      onMoveRowDown,
      onMoveRowUp,
      onNavigateDown,
      onNavigateUp,
      onStructuralKey,
    ]
  );

  return (
    <div
      className="code-shiki relative rounded-md bg-muted text-[length:calc(0.875rem*var(--page-text-scale))] leading-6"
      ref={wrapperRef}
    >
      <div className="absolute top-1.5 right-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            nativeButton
            onPointerDown={(event) => event.stopPropagation()}
            render={
              <Button
                aria-label="Code language"
                className="bg-muted/70 text-muted-foreground backdrop-blur-sm"
                size="xs"
                variant="ghost"
              >
                {codeLanguageLabel(language)}
                <IconChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent
            align="end"
            className="max-h-72 overflow-y-auto"
            data-canvas-row-menu
          >
            <DropdownMenuRadioGroup
              onValueChange={(value) => onChange({ ...props, language: value })}
              value={language}
            >
              {CODE_LANGUAGES.map((entry) => (
                <DropdownMenuRadioItem key={entry.id} value={entry.id}>
                  {entry.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Editor
        highlight={(code) => highlightToHtml(code, language)}
        onKeyDown={handleKeyDown}
        onValueChange={(text) => onChange({ ...props, text })}
        padding={{ top: 12, right: 112, bottom: 12, left: 16 }}
        placeholder="Code"
        preClassName="code-shiki"
        textareaClassName="outline-none focus:outline-none focus-visible:outline-none"
        value={props.text}
      />
    </div>
  );
}
