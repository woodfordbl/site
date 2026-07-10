/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FormulaCodeEditor,
  type FormulaCodeEditorHandle,
} from "@/components/database/formula-code-editor.tsx";

/**
 * jsdom has no layout: CodeMirror measures text through
 * `Range#getClientRects`/`getBoundingClientRect`, which jsdom leaves
 * unimplemented. Empty geometry is enough for mount + dispatch (nothing here
 * needs real coordinates).
 */
const EMPTY_RECT = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

function emptyRectList(): DOMRectList {
  return {
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  } as unknown as DOMRectList;
}

beforeEach(() => {
  Range.prototype.getClientRects = emptyRectList;
  Range.prototype.getBoundingClientRect = () => EMPTY_RECT;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function cmContent(): HTMLElement {
  const content = document.querySelector(".cm-content");
  if (!(content instanceof HTMLElement)) {
    throw new Error("CodeMirror content not mounted");
  }
  return content;
}

describe("FormulaCodeEditor", () => {
  it("renders the controlled value with tokenizer-driven highlighting", () => {
    render(
      <FormulaCodeEditor
        ariaLabel="Formula expression"
        onChange={vi.fn()}
        value={"thisPage.Price + round(1.5) // note"}
      />
    );

    expect(cmContent().textContent).toContain("thisPage.Price + round(1.5)");
    expect(document.querySelector(".cm-formula-property")?.textContent).toBe(
      "thisPage.Price"
    );
    expect(document.querySelector(".cm-formula-function")?.textContent).toBe(
      "round"
    );
    expect(document.querySelector(".cm-formula-number")?.textContent).toBe(
      "1.5"
    );
    expect(document.querySelector(".cm-formula-comment")?.textContent).toBe(
      "// note"
    );
  });

  it("round-trips: external value changes update the doc without echoing onChange", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FormulaCodeEditor
        ariaLabel="Formula expression"
        onChange={onChange}
        value="1 + 2"
      />
    );
    expect(cmContent().textContent).toContain("1 + 2");

    rerender(
      <FormulaCodeEditor
        ariaLabel="Formula expression"
        onChange={onChange}
        value="3 * 4"
      />
    );
    expect(cmContent().textContent).toContain("3 * 4");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("insertText splices at the caret, places it caretOffset in, and reports the change", () => {
    const editorRef = createRef<FormulaCodeEditorHandle>();
    const onChange = vi.fn();
    render(
      <FormulaCodeEditor
        ariaLabel="Formula expression"
        editorRef={editorRef}
        onChange={onChange}
        value=""
      />
    );

    act(() => {
      editorRef.current?.insertText("average()", "average(".length);
    });
    expect(onChange).toHaveBeenLastCalledWith("average()");

    // Caret sits inside the parens; the second insert lands there.
    act(() => {
      editorRef.current?.insertText("thisPage.Price", "thisPage.Price".length);
    });
    expect(onChange).toHaveBeenLastCalledWith("average(thisPage.Price)");
  });

  it("fires onSubmit on Mod+Enter", () => {
    const onSubmit = vi.fn();
    render(
      <FormulaCodeEditor
        ariaLabel="Formula expression"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        value="1 + 2"
      />
    );

    fireEvent.keyDown(cmContent(), { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("stops non-Escape keys from reaching menu ancestors; Escape bubbles", () => {
    // Document-level listener stands in for the enclosing Base UI menu
    // popup's typeahead handling (an ancestor in the bubble path).
    const onOuterKeyDown = vi.fn();
    document.addEventListener("keydown", onOuterKeyDown);
    try {
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          onChange={vi.fn()}
          value=""
        />
      );

      fireEvent.keyDown(cmContent(), { key: "a" });
      expect(onOuterKeyDown).not.toHaveBeenCalled();

      fireEvent.keyDown(cmContent(), { key: "Escape" });
      expect(onOuterKeyDown).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", onOuterKeyDown);
    }
  });
});
