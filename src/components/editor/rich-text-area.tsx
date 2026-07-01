import {
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";

import { classNameForMarks } from "@/components/editor/rich-text.tsx";
import {
  normalizeInlineMarks,
  segmentRichText,
} from "@/lib/blocks/rich-text.ts";
import { getFieldSelection } from "@/lib/editor/caret-navigation.ts";
import {
  insertPlainTextAtSelection,
  type RichTextDomSnapshot,
  richTextToHtml,
  serializeRichTextDom,
  setRichTextSelection,
} from "@/lib/editor/rich-text-dom.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";
import { cn } from "@/lib/utils.ts";

interface RichTextAreaProps {
  ariaLabel?: string;
  className?: string;
  fieldRef: RefObject<HTMLDivElement | null>;
  marks: InlineMark[];
  multiline: boolean;
  onBlur: () => void;
  onFocus: () => void;
  onInput: (snapshot: RichTextDomSnapshot) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** Rendered via the `empty:before` placeholder classes when set. */
  placeholder?: string;
  value: string;
}

function snapshotEquals(
  snapshot: RichTextDomSnapshot,
  value: string,
  marks: readonly InlineMark[]
): boolean {
  if (snapshot.text !== value) {
    return false;
  }
  if (snapshot.marks.length !== marks.length) {
    return false;
  }
  return snapshot.marks.every((mark, index) => {
    const other = marks[index];
    return (
      other !== undefined &&
      mark.type === other.type &&
      mark.start === other.start &&
      mark.end === other.end
    );
  });
}

function buildContent(root: HTMLElement, value: string, marks: InlineMark[]) {
  const doc = root.ownerDocument;
  const fragment = doc.createDocumentFragment();
  for (const segment of segmentRichText(value, marks)) {
    if (segment.marks.length === 0) {
      fragment.append(doc.createTextNode(segment.text));
    } else {
      const span = doc.createElement("span");
      span.dataset.marks = segment.marks.join(" ");
      span.className = classNameForMarks(segment.marks);
      span.textContent = segment.text;
      fragment.append(span);
    }
  }
  root.replaceChildren(fragment);
}

/**
 * ContentEditable text field driven by `(value, marks)`. The DOM is the source
 * of truth while typing (native editing, serialized back on every input); the
 * component only rebuilds its DOM when the incoming model no longer matches
 * what the DOM says — e.g. a mark toggled from the toolbar or an external
 * update — restoring the caret afterwards. IME composition suspends both
 * serialization and rebuilds until `compositionend`.
 */
export function RichTextArea({
  ariaLabel,
  className,
  fieldRef,
  marks,
  multiline,
  onBlur,
  onFocus,
  onInput,
  onKeyDown,
  placeholder,
  value,
}: RichTextAreaProps) {
  const composingRef = useRef(false);
  const normalizedMarks = normalizeInlineMarks(marks, value.length);

  // Initial (and server-rendered) content. Computed once — the identity stays
  // stable so React never rewrites the DOM; after mount the layout effect owns
  // syncing the field against the model.
  const initialHtmlRef = useRef<{ __html: string } | null>(null);
  if (initialHtmlRef.current === null) {
    initialHtmlRef.current = {
      __html: richTextToHtml(value, normalizedMarks, classNameForMarks),
    };
  }

  useLayoutEffect(() => {
    const root = fieldRef.current;
    if (!root || composingRef.current) {
      return;
    }
    if (snapshotEquals(serializeRichTextDom(root), value, normalizedMarks)) {
      return;
    }

    const hadFocus = root.ownerDocument.activeElement === root;
    const selection = hadFocus ? getFieldSelection(root) : null;
    buildContent(root, value, normalizedMarks);
    if (hadFocus && selection) {
      setRichTextSelection(root, {
        start: Math.min(selection.start, value.length),
        end: Math.min(selection.end, value.length),
      });
    }
  });

  const emitSnapshot = useCallback(() => {
    const root = fieldRef.current;
    if (!root) {
      return;
    }
    const snapshot = serializeRichTextDom(root);
    onInput(
      multiline
        ? snapshot
        : { ...snapshot, text: snapshot.text.replace(/\n/g, "") }
    );
  }, [fieldRef, multiline, onInput]);

  const handleInput = useCallback(() => {
    if (composingRef.current) {
      return;
    }
    emitSnapshot();
  }, [emitSnapshot]);

  const handleBeforeInput = useCallback(
    (event: SyntheticEvent<HTMLDivElement, InputEvent>) => {
      const inputType = event.nativeEvent.inputType;
      if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
        // Enter is a structural command handled at keydown; Shift+Enter inserts
        // a literal newline in multiline fields.
        event.preventDefault();
        if (inputType === "insertLineBreak" && multiline) {
          const root = fieldRef.current;
          if (root) {
            insertPlainTextAtSelection(root, "\n");
            emitSnapshot();
          }
        }
      }
    },
    [emitSnapshot, fieldRef, multiline]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const root = fieldRef.current;
      if (!root) {
        return;
      }
      let pasted = event.clipboardData.getData("text/plain");
      if (!multiline) {
        pasted = pasted.replace(/\n/g, " ");
      }
      if (!pasted) {
        return;
      }
      insertPlainTextAtSelection(root, pasted);
      emitSnapshot();
    },
    [emitSnapshot, fieldRef, multiline]
  );

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    emitSnapshot();
  }, [emitSnapshot]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: contenteditable field — native inputs cannot render styled inline spans.
    <div
      aria-label={ariaLabel}
      aria-multiline={multiline || undefined}
      className={cn(
        "min-h-[1lh] cursor-text whitespace-pre-wrap break-words",
        className
      )}
      contentEditable
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is built from our own escaped model so SSR ships the field content.
      dangerouslySetInnerHTML={initialHtmlRef.current}
      data-canvas-field
      data-placeholder={placeholder}
      data-rich-text-field
      onBeforeInput={handleBeforeInput}
      onBlur={onBlur}
      onCompositionEnd={handleCompositionEnd}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onFocus={onFocus}
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onPaste={handlePaste}
      ref={fieldRef}
      role="textbox"
      tabIndex={0}
    />
  );
}
