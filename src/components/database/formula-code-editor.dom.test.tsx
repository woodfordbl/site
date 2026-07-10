/** @vitest-environment jsdom */
import { EditorView } from "@codemirror/view";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FormulaCodeEditor,
  type FormulaCodeEditorHandle,
} from "@/components/database/formula-code-editor.tsx";
import type { DatabaseField } from "@/lib/schemas/database.ts";

const FIELDS: DatabaseField[] = [
  { id: "f-price", name: "Price", type: "number" },
  { id: "f-qty", name: "Unit Count", type: "number" },
];

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
        fields={FIELDS}
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
        fields={FIELDS}
        onChange={onChange}
        value="1 + 2"
      />
    );
    expect(cmContent().textContent).toContain("1 + 2");

    rerender(
      <FormulaCodeEditor
        ariaLabel="Formula expression"
        fields={FIELDS}
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
        fields={FIELDS}
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
        fields={FIELDS}
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
          fields={FIELDS}
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

  describe("property chips", () => {
    function chip(): HTMLElement {
      const element = document.querySelector(".cm-formula-chip");
      if (!(element instanceof HTMLElement)) {
        throw new Error("chip not rendered");
      }
      return element;
    }

    it("renders prop() spans as schema-labeled chips that relabel on rename", () => {
      const { rerender } = render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          fields={FIELDS}
          onChange={vi.fn()}
          value={'prop("f-price") * 2'}
        />
      );

      // The chip shows the CURRENT field name + its type icon; the raw id is
      // replaced, not displayed.
      expect(chip().textContent).toBe("Price");
      expect(chip().getAttribute("aria-label")).toBe("Property Price");
      expect(chip().querySelector("svg")).not.toBeNull();
      expect(cmContent().textContent).not.toContain("f-price");

      // A rename while the editor is open relabels the chip in place.
      rerender(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          fields={[{ id: "f-price", name: "Cost", type: "number" }]}
          onChange={vi.fn()}
          value={'prop("f-price") * 2'}
        />
      );
      expect(chip().textContent).toBe("Cost");
    });

    it("renders unknown ids as destructive Unknown-property chips", () => {
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          fields={FIELDS}
          onChange={vi.fn()}
          value={'prop("f-ghost") + 1'}
        />
      );

      expect(chip().textContent).toBe("f-ghost");
      expect(chip().title).toBe("Unknown property");
      expect(chip().className).toContain("text-destructive");
      expect(chip().className).toContain("line-through");
    });

    it("is atomic: backspace removes the whole reference, arrows skip over it", () => {
      const onChange = vi.fn();
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          fields={FIELDS}
          onChange={onChange}
          value={'1 + prop("f-price")'}
        />
      );

      const editor = document.querySelector(".cm-editor") as HTMLElement;
      const view = EditorView.findFromDOM(editor);
      const doc = '1 + prop("f-price")';

      // Caret starts at the end of the doc. One ArrowLeft jumps across the
      // whole chip — no intermediate positions inside the canonical text —
      // and one ArrowRight jumps back over it.
      fireEvent.keyDown(cmContent(), { key: "ArrowLeft" });
      expect(view?.state.selection.main.head).toBe("1 + ".length);
      fireEvent.keyDown(cmContent(), { key: "ArrowRight" });
      expect(view?.state.selection.main.head).toBe(doc.length);

      // One Backspace at its right edge deletes the entire reference.
      fireEvent.keyDown(cmContent(), { key: "Backspace" });
      expect(onChange).toHaveBeenLastCalledWith("1 + ");
      expect(document.querySelector(".cm-formula-chip")).toBeNull();
    });

    it("insert-then-type round trip: canonical insert chips immediately, caret lands after", () => {
      const editorRef = createRef<FormulaCodeEditorHandle>();
      const onChange = vi.fn();
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          editorRef={editorRef}
          fields={FIELDS}
          onChange={onChange}
          value=""
        />
      );

      const reference = 'prop("f-price")';
      act(() => {
        editorRef.current?.insertText(reference, reference.length);
      });
      expect(chip().textContent).toBe("Price");

      // The caret-offset convention put the caret after the chip, so the
      // next insert continues the expression.
      act(() => {
        editorRef.current?.insertText(" + 2", " + 2".length);
      });
      expect(onChange).toHaveBeenLastCalledWith('prop("f-price") + 2');
      expect(chip().textContent).toBe("Price");
    });

    it("converts a completed typed reference once the caret leaves its span", async () => {
      const editorRef = createRef<FormulaCodeEditorHandle>();
      const onChange = vi.fn();
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          editorRef={editorRef}
          fields={FIELDS}
          onChange={onChange}
          value=""
        />
      );

      // Caret ends at the reference's right edge — still "mid-word", so the
      // canonicalizer must leave it alone.
      act(() => {
        editorRef.current?.insertText(
          "thisPage.Price",
          "thisPage.Price".length
        );
      });
      await act(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 250);
          })
      );
      expect(document.querySelector(".cm-formula-chip")).toBeNull();
      expect(onChange).toHaveBeenLastCalledWith("thisPage.Price");

      // Typing past the reference moves the caret off its span; the debounce
      // then converts it into a canonical chip without moving the caret's
      // logical position.
      act(() => {
        editorRef.current?.insertText(" + 1", " + 1".length);
      });
      await waitFor(() => {
        expect(document.querySelector(".cm-formula-chip")).not.toBeNull();
      });
      expect(onChange).toHaveBeenLastCalledWith('prop("f-price") + 1');

      // The mapped caret still points at the end of the doc: an appended
      // insert lands after the converted text.
      act(() => {
        editorRef.current?.insertText(" + 2", " + 2".length);
      });
      expect(onChange).toHaveBeenLastCalledWith('prop("f-price") + 1 + 2');
    });
  });
});
