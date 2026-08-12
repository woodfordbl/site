import { useNavigate } from "@tanstack/react-router";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type SyntheticEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { InlineFormulaValues } from "@/components/editor/inline-formula-values.tsx";
import {
  collectInlinePageLinkChromeHosts,
  InlinePageLinkChrome,
  type InlinePageLinkChromeHost,
  inlinePageLinkChromeHostsEqual,
  inlinePageLinkClassName,
} from "@/components/editor/inline-page-link.tsx";
import { classNameForMarks } from "@/components/editor/rich-text.tsx";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  isLikelyUrl,
  normalizeInlineMarks,
  segmentRichText,
} from "@/lib/blocks/rich-text.ts";
import { extractPrimaryPastedUrl } from "@/lib/canvas/paste-url.ts";
import { getFieldSelection } from "@/lib/editor/caret-navigation.ts";
import {
  applyInlineFormulaValues,
  createInlineFormulaToken,
  createInlinePageLinkAnchor,
  insertLinkedTextAtSelection,
  insertLinkOverSelection,
  insertPlainTextAtSelection,
  pageLinkTitleMarks,
  type RichTextDomSnapshot,
  repairInlineFormulaTokenDom,
  repairInlinePageLinkDom,
  richTextToHtml,
  serializeRichTextDom,
  setRichTextSelection,
} from "@/lib/editor/rich-text-dom.ts";
import { resolvePageIdFromUrl } from "@/lib/pages/resolve-page-from-url.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";
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

/** Stable empty map — a fresh one per render would re-run the value pass. */
const NO_FORMULA_VALUES: ReadonlyMap<number, string> = new Map();

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
      mark.end === other.end &&
      mark.href === other.href &&
      mark.pageId === other.pageId &&
      mark.expression === other.expression
    );
  });
}

function buildContent(root: HTMLElement, value: string, marks: InlineMark[]) {
  const doc = root.ownerDocument;
  const fragment = doc.createDocumentFragment();
  for (const segment of segmentRichText(value, marks)) {
    if (segment.marks.length === 0) {
      fragment.append(doc.createTextNode(segment.text));
      continue;
    }
    if (segment.expression !== undefined) {
      // Rebuilt as a fresh element: the value is chrome, so a rebuild drops it
      // back to the placeholder until the next value pass writes it in.
      fragment.append(
        createInlineFormulaToken(doc, {
          className: classNameForMarks(segment.marks),
          expression: segment.expression,
        })
      );
      continue;
    }
    if (segment.href && segment.pageId) {
      const styleMarks = pageLinkTitleMarks(segment.marks);
      fragment.append(
        createInlinePageLinkAnchor(doc, {
          className: inlinePageLinkClassName,
          href: segment.href,
          markTokens: segment.marks.join(" "),
          pageId: segment.pageId,
          text: segment.text,
          ...(styleMarks.length > 0
            ? { titleClassName: classNameForMarks(styleMarks) }
            : {}),
        })
      );
      continue;
    }
    const element = doc.createElement(segment.href ? "a" : "span");
    element.dataset.marks = segment.marks.join(" ");
    element.className = classNameForMarks(segment.marks);
    if (segment.href) {
      element.setAttribute("href", segment.href);
      element.dataset.href = segment.href;
    }
    element.textContent = segment.text;
    fragment.append(element);
  }
  root.replaceChildren(fragment);
}

function fieldHasNonCollapsedSelection(root: HTMLElement): boolean {
  const domSelection = root.ownerDocument.getSelection();
  return Boolean(
    domSelection &&
      domSelection.rangeCount > 0 &&
      !domSelection.isCollapsed &&
      root.contains(domSelection.getRangeAt(0).startContainer)
  );
}

function insertUrlAtSelection(
  root: HTMLElement,
  url: string,
  hasSelection: boolean,
  options?: { label?: string; pageId?: string }
): void {
  const className = options?.pageId
    ? inlinePageLinkClassName
    : classNameForMarks(["link"]);
  if (hasSelection) {
    insertLinkOverSelection(root, url, className, options);
    return;
  }
  insertLinkedTextAtSelection(root, url, className, options);
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
  const navigate = useNavigate();
  const { pages } = useMergedPageListItems();
  const normalizedMarks = normalizeInlineMarks(marks, value.length);
  const [chromeHosts, setChromeHosts] = useState<InlinePageLinkChromeHost[]>(
    []
  );
  const hasFormulaTokens = normalizedMarks.some(
    (mark) => mark.type === "formula"
  );
  const [formulaValues, setFormulaValues] =
    useState<ReadonlyMap<number, string>>(NO_FORMULA_VALUES);

  // Initial (and server-rendered) content. Computed once — the identity stays
  // stable so React never rewrites the DOM; after mount the layout effect owns
  // syncing the field against the model.
  const initialHtmlRef = useRef<{ __html: string } | null>(null);
  if (initialHtmlRef.current === null) {
    initialHtmlRef.current = {
      __html: richTextToHtml(value, normalizedMarks, classNameForMarks, {
        classForPageLink: () => inlinePageLinkClassName,
      }),
    };
  }

  // Keeps the field DOM in sync with the model and re-reads the page-link
  // chrome hosts afterwards — the rescan must follow the rebuild, so it lives
  // here rather than in a child effect (children run first).
  useLayoutEffect(() => {
    const root = fieldRef.current;
    if (!root || composingRef.current) {
      return;
    }
    if (!snapshotEquals(serializeRichTextDom(root), value, normalizedMarks)) {
      const hadFocus = root.ownerDocument.activeElement === root;
      const selection = hadFocus ? getFieldSelection(root) : null;
      buildContent(root, value, normalizedMarks);
      if (hadFocus && selection) {
        setRichTextSelection(root, {
          start: Math.min(selection.start, value.length),
          end: Math.min(selection.end, value.length),
        });
      }
    }

    // After any rebuild: a rebuilt token starts at its placeholder, and this
    // writes chrome only, so it never dirties the field it just synced.
    if (hasFormulaTokens) {
      applyInlineFormulaValues(root, formulaValues);
    }

    const nextHosts = collectInlinePageLinkChromeHosts(root);
    setChromeHosts((previous) =>
      inlinePageLinkChromeHostsEqual(previous, nextHosts) ? previous : nextHosts
    );
  });

  const emitSnapshot = useCallback(() => {
    const root = fieldRef.current;
    if (!root) {
      return;
    }
    // Typing at a link edge can still land inside the anchor; lift it out
    // before reading, so the run's marks never spread onto the new text.
    repairInlinePageLinkDom(root);
    // The same at a token edge, where the stakes are higher: a token's subtree
    // is not serialized, so text left inside would vanish on this read.
    repairInlineFormulaTokenDom(root);
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
      const primaryUrl =
        extractPrimaryPastedUrl(event.clipboardData) ??
        event.clipboardData.getData("text/plain").trim();
      const hasSelection = fieldHasNonCollapsedSelection(root);
      if (primaryUrl && isLikelyUrl(primaryUrl)) {
        const url = primaryUrl.trim();
        const pageId = resolvePageIdFromUrl(
          url,
          pages,
          root.ownerDocument.defaultView?.location.origin ??
            window.location.origin
        );
        if (pageId) {
          const page = pages.find((entry) => entry.id === pageId);
          insertUrlAtSelection(root, url, hasSelection, {
            pageId,
            label: page?.title.trim() || "Untitled",
          });
        } else {
          insertUrlAtSelection(root, url, hasSelection);
        }
        emitSnapshot();
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
    [emitSnapshot, fieldRef, multiline, pages]
  );

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    emitSnapshot();
  }, [emitSnapshot]);

  // Plain links open in a new tab; page links navigate in-app. A text selection
  // over the anchor leaves it editable and raises the format toolbar.
  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || event.defaultPrevented) {
        return;
      }
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[data-href],a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const selection = anchor.ownerDocument.getSelection();
      if (selection && !selection.isCollapsed) {
        return;
      }
      const pageId = anchor.dataset.pageId?.trim();
      if (pageId) {
        event.preventDefault();
        const navTarget = resolvePageNavTarget(pageId, pages);
        navigate(navTarget);
        return;
      }
      const href = anchor.dataset.href ?? anchor.getAttribute("href");
      if (!href) {
        return;
      }
      event.preventDefault();
      anchor.ownerDocument.defaultView?.open(
        href,
        "_blank",
        "noopener,noreferrer"
      );
    },
    [navigate, pages]
  );

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: contenteditable field — native inputs cannot render styled inline spans. */}
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
        onClick={handleClick}
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
      <InlinePageLinkChrome hosts={chromeHosts} />
      {hasFormulaTokens && (
        <InlineFormulaValues
          marks={normalizedMarks}
          onValues={setFormulaValues}
        />
      )}
    </>
  );
}
