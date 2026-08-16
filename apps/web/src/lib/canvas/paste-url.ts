import { isLikelyUrl } from "@/lib/blocks/rich-text.ts";
import { parseValidatedUrlInput } from "@/lib/schemas/url-input.ts";

const SINGLE_ANCHOR_HREF_RE =
  /^\s*(?:<!--[\s\S]*?-->\s*)*<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>[\s\S]*?<\/a>\s*$/i;

/**
 * Pulls a lone URL out of paste clipboard data. Accepts:
 * - plain text that is itself a bare http(s) URL
 * - HTML that is a single `<a href>` (browser "copy link") whose href is a URL,
 *   including when `text/plain` is the link label rather than the href
 *
 * Multi-block HTML/markdown and mixed payloads return `null` so rich paste and
 * media paths stay untouched.
 */
export function extractPrimaryPastedUrl(
  data: DataTransfer | null
): string | null {
  if (!data) {
    return null;
  }

  const plain = data.getData("text/plain").trim();
  if (isLikelyUrl(plain)) {
    return parseValidatedUrlInput(plain) ?? plain.trim();
  }

  const html = data.getData("text/html").trim();
  if (!html) {
    return null;
  }

  const match = SINGLE_ANCHOR_HREF_RE.exec(html);
  const href = match?.[2]?.trim();
  if (!(href && isLikelyUrl(href))) {
    return null;
  }

  // Reject when plain text looks like a multi-line paste that happened to
  // include one anchor in the HTML mirror.
  if (plain.includes("\n")) {
    return null;
  }

  return parseValidatedUrlInput(href) ?? href;
}

/**
 * True when the active canvas field has a non-collapsed text selection — paste
 * should wrap that selection as an inline link instead of creating a pageLink.
 */
export function hasNonCollapsedCanvasFieldSelection(
  active: Element | null = document.activeElement
): boolean {
  if (!(active instanceof HTMLElement)) {
    return false;
  }

  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  ) {
    if (!active.matches("[data-canvas-field]")) {
      return false;
    }
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    return start !== end;
  }

  if (!(active.isContentEditable && active.matches("[data-canvas-field]"))) {
    return false;
  }

  const selection = active.ownerDocument.getSelection();
  return Boolean(
    selection &&
      selection.rangeCount > 0 &&
      !selection.isCollapsed &&
      active.contains(selection.getRangeAt(0).startContainer)
  );
}
