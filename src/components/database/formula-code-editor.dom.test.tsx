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
import { formulaCheckContext } from "@/lib/databases/formula-values.ts";
import type { FormulaRefDatabase } from "@/lib/formula/ref-rewrite.ts";
import { prepareUserFunctions } from "@/lib/formula/user-functions.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

const FIELDS: DatabaseField[] = [
  { id: "f-price", name: "Price", type: "number" },
  { id: "f-qty", name: "Unit Count", type: "number" },
  { id: "f-note", name: "Note", type: "text" },
];

const DATABASES: FormulaRefDatabase[] = [
  { id: "db-tasks", name: "Tasks" },
  { id: "db-projects", name: "Projects" },
];

// The panel memoizes this once per schema; the editor takes it as a prop.
const CHECK_CONTEXT = formulaCheckContext(FIELDS);

// A context carrying a user-defined function, for the completion tests.
const USER_FN_CONTEXT = formulaCheckContext(
  FIELDS,
  undefined,
  prepareUserFunctions([
    {
      description: "Score with a weighting factor.",
      expression: "points * weight * 1.1",
      name: "weightedScore",
      params: ["points", "weight"],
    },
  ])
);

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

function editorView(): EditorView {
  const editor = document.querySelector(".cm-editor");
  const view =
    editor instanceof HTMLElement ? EditorView.findFromDOM(editor) : null;
  if (view === null) {
    throw new Error("editor view not mounted");
  }
  return view;
}

/** Simulate typing: splice at the caret as an `input.type` user event. */
function typeText(text: string): void {
  act(() => {
    const view = editorView();
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, insert: text, to },
      selection: { anchor: from + text.length },
      userEvent: "input.type",
    });
  });
}

describe("FormulaCodeEditor", () => {
  it("renders the controlled value with tokenizer-driven highlighting", () => {
    render(
      <FormulaCodeEditor
        ariaLabel="Formula expression"
        checkContext={CHECK_CONTEXT}
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
        checkContext={CHECK_CONTEXT}
        fields={FIELDS}
        onChange={onChange}
        value="1 + 2"
      />
    );
    expect(cmContent().textContent).toContain("1 + 2");

    rerender(
      <FormulaCodeEditor
        ariaLabel="Formula expression"
        checkContext={CHECK_CONTEXT}
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
        checkContext={CHECK_CONTEXT}
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
        checkContext={CHECK_CONTEXT}
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
          checkContext={CHECK_CONTEXT}
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
          checkContext={CHECK_CONTEXT}
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
          checkContext={CHECK_CONTEXT}
          fields={[{ id: "f-price", name: "Cost", type: "number" }]}
          onChange={vi.fn()}
          value={'prop("f-price") * 2'}
        />
      );
      expect(chip().textContent).toBe("Cost");
    });

    it("renders a chip on the second line of a let-statement formula", () => {
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          fields={FIELDS}
          onChange={vi.fn()}
          value={'let t = 1;\nround(prop("f-price") * t, 2)'}
        />
      );

      expect(chip().textContent).toBe("Price");
      expect(cmContent().textContent).not.toContain("f-price");
      // The statement line renders untouched around it.
      expect(cmContent().textContent).toContain("let t = 1;");
    });

    it("renders unknown ids as destructive Unknown-property chips", () => {
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
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
          checkContext={CHECK_CONTEXT}
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
          checkContext={CHECK_CONTEXT}
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
          checkContext={CHECK_CONTEXT}
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

  describe("database chips", () => {
    function chip(): HTMLElement {
      const element = document.querySelector(".cm-formula-chip");
      if (!(element instanceof HTMLElement)) {
        throw new Error("chip not rendered");
      }
      return element;
    }

    it("renders db() spans as name-labeled chips that relabel on rename", () => {
      const { rerender } = render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          databases={DATABASES}
          fields={FIELDS}
          onChange={vi.fn()}
          value={'db("db-tasks").length()'}
        />
      );

      // The chip shows the CURRENT database name + the database glyph; the
      // raw id is replaced, not displayed.
      expect(chip().textContent).toBe("Tasks");
      expect(chip().getAttribute("aria-label")).toBe("Database Tasks");
      expect(chip().querySelector("svg")).not.toBeNull();
      expect(cmContent().textContent).not.toContain("db-tasks");

      // A database rename while the editor is open relabels the chip.
      rerender(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          databases={[{ id: "db-tasks", name: "Chores" }]}
          fields={FIELDS}
          onChange={vi.fn()}
          value={'db("db-tasks").length()'}
        />
      );
      expect(chip().textContent).toBe("Chores");
    });

    it("renders unknown ids as destructive Unknown-database chips", () => {
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          databases={DATABASES}
          fields={FIELDS}
          onChange={vi.fn()}
          value={'db("db-ghost").length()'}
        />
      );

      expect(chip().textContent).toBe("db-ghost");
      expect(chip().title).toBe("Unknown database");
      expect(chip().className).toContain("text-destructive");
      expect(chip().className).toContain("line-through");
    });

    it("is atomic: backspace removes the whole db reference", () => {
      const onChange = vi.fn();
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          databases={DATABASES}
          fields={FIELDS}
          onChange={onChange}
          value={'1 + db("db-tasks")'}
        />
      );

      // Caret starts at the end; one ArrowLeft jumps across the whole chip
      // (no intermediate positions inside the canonical text).
      fireEvent.keyDown(cmContent(), { key: "ArrowLeft" });
      expect(editorView().state.selection.main.head).toBe("1 + ".length);

      // One Backspace at its right edge deletes the entire reference.
      act(() => {
        const view = editorView();
        view.dispatch({ selection: { anchor: view.state.doc.length } });
      });
      fireEvent.keyDown(cmContent(), { key: "Backspace" });
      expect(onChange).toHaveBeenLastCalledWith("1 + ");
      expect(document.querySelector(".cm-formula-chip")).toBeNull();
    });

    it('converts a typed db("Name") reference once the caret leaves its span', async () => {
      const editorRef = createRef<FormulaCodeEditorHandle>();
      const onChange = vi.fn();
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          databases={DATABASES}
          editorRef={editorRef}
          fields={FIELDS}
          onChange={onChange}
          value=""
        />
      );

      // A completed db("…") span chips token-level whatever its argument —
      // the NAME form renders as a destructive unknown chip (names aren't
      // ids) — but the canonicalizer must leave the TEXT alone while the
      // caret still abuts the reference. (Same contract as a hand-typed
      // name-form prop("Price").)
      act(() => {
        editorRef.current?.insertText('db("Tasks")', 'db("Tasks")'.length);
      });
      await act(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 250);
          })
      );
      expect(chip().title).toBe("Unknown database");
      expect(onChange).toHaveBeenLastCalledWith('db("Tasks")');

      // Typing past the reference moves the caret off its span; the debounce
      // then rewrites the name form to the canonical id form, and the chip
      // resolves to the known database.
      act(() => {
        editorRef.current?.insertText(".length()", ".length()".length);
      });
      await waitFor(() => {
        expect(chip().getAttribute("aria-label")).toBe("Database Tasks");
      });
      expect(onChange).toHaveBeenLastCalledWith('db("db-tasks").length()');
      expect(chip().textContent).toBe("Tasks");
    });

    it("reports chip taps with kind database and the current span", () => {
      const onChipTap = vi.fn();
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          databases={DATABASES}
          fields={FIELDS}
          onChange={vi.fn()}
          onChipTap={onChipTap}
          value={'db("db-tasks") + 1'}
        />
      );

      const tapped = chip();
      fireEvent.click(tapped);
      expect(onChipTap).toHaveBeenLastCalledWith({
        anchor: tapped,
        from: 0,
        kind: "database",
        refId: "db-tasks",
        to: 'db("db-tasks")'.length,
      });
    });
  });

  describe("chip option menu hook", () => {
    function chip(): HTMLElement {
      const element = document.querySelector(".cm-formula-chip");
      if (!(element instanceof HTMLElement)) {
        throw new Error("chip not rendered");
      }
      return element;
    }

    it("emits onChipTap with the field id and the chip's CURRENT span", () => {
      const onChipTap = vi.fn();
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          fields={FIELDS}
          onChange={vi.fn()}
          onChipTap={onChipTap}
          value={'prop("f-price") + 1'}
        />
      );

      const first = chip();
      fireEvent.click(first);
      expect(onChipTap).toHaveBeenCalledTimes(1);
      expect(onChipTap).toHaveBeenLastCalledWith({
        anchor: first,
        from: 0,
        kind: "property",
        refId: "f-price",
        to: 'prop("f-price")'.length,
      });

      // Text inserted BEFORE the chip shifts its span: a later tap must
      // report positions resolved from the CURRENT doc, not offsets captured
      // when the decoration was built.
      act(() => {
        editorView().dispatch({
          changes: { from: 0, insert: "10 + ", to: 0 },
        });
      });
      const shifted = chip();
      fireEvent.click(shifted);
      expect(onChipTap).toHaveBeenLastCalledWith({
        anchor: shifted,
        from: "10 + ".length,
        kind: "property",
        refId: "f-price",
        to: '10 + prop("f-price")'.length,
      });
    });

    it("intercepts chip presses only while onChipTap is wired", () => {
      const onChipTap = vi.fn();
      const { unmount } = render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          fields={FIELDS}
          onChange={vi.fn()}
          onChipTap={onChipTap}
          value={'prop("f-price") * 2'}
        />
      );

      // Wired: the press is swallowed (fireEvent returns false when
      // preventDefault ran) — no caret jump to the chip boundary — and the
      // click reports the tap instead of falling through to CM.
      expect(fireEvent.mouseDown(chip())).toBe(false);
      expect(onChipTap).not.toHaveBeenCalled();
      expect(fireEvent.click(chip())).toBe(false);
      expect(onChipTap).toHaveBeenCalledTimes(1);
      unmount();

      // Unwired: the click falls through to CM untouched (mousedown stays
      // CM's own press handling), keeping the default caret-at-boundary
      // behavior the atomicity tests pin down.
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          fields={FIELDS}
          onChange={vi.fn()}
          value={'prop("f-price") * 2'}
        />
      );
      expect(fireEvent.click(chip())).toBe(true);
    });

    it("replaceRange swaps a canonical span in place and can delete it", () => {
      const editorRef = createRef<FormulaCodeEditorHandle>();
      const onChange = vi.fn();
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          editorRef={editorRef}
          fields={FIELDS}
          onChange={onChange}
          value={'prop("f-price") + 1'}
        />
      );

      // The menu's Change-property path: splice the new canonical reference
      // over the old span; the chip relabels and the caret lands after it.
      act(() => {
        editorRef.current?.replaceRange(
          0,
          'prop("f-price")'.length,
          'prop("f-qty")'
        );
      });
      expect(onChange).toHaveBeenLastCalledWith('prop("f-qty") + 1');
      expect(chip().textContent).toBe("Unit Count");
      expect(editorView().state.selection.main.head).toBe(
        'prop("f-qty")'.length
      );

      // The menu's Remove path: empty text deletes the span outright.
      act(() => {
        editorRef.current?.replaceRange(0, 'prop("f-qty")'.length, "");
      });
      expect(onChange).toHaveBeenLastCalledWith(" + 1");
      expect(document.querySelector(".cm-formula-chip")).toBeNull();
    });
  });

  describe("fused autocomplete", () => {
    function popup(): HTMLElement | null {
      const element = document.querySelector(".cm-tooltip-autocomplete");
      return element instanceof HTMLElement ? element : null;
    }

    async function waitForPopup(): Promise<HTMLElement> {
      await waitFor(() => {
        expect(popup()).not.toBeNull();
      });
      const element = popup();
      if (element === null) {
        throw new Error("completion popup not open");
      }
      return element;
    }

    /**
     * CM ignores accept/move commands for `interactionDelay` (75ms) after
     * the popup opens (accidental-Enter protection); settle past it before
     * accepting.
     */
    async function settleInteractionDelay(): Promise<void> {
      await act(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 100);
          })
      );
    }

    function optionLabels(element: HTMLElement): string[] {
      return [...element.querySelectorAll("li .cm-completionLabel")].map(
        (label) => label.textContent ?? ""
      );
    }

    function renderEditor(
      onChange = vi.fn(),
      fields = FIELDS,
      databases?: readonly FormulaRefDatabase[]
    ) {
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          databases={databases}
          fields={fields}
          onChange={onChange}
          value=""
        />
      );
      return onChange;
    }

    it("opens on typed identifiers with properties, functions, and keywords fused", async () => {
      renderEditor();
      typeText("pri");

      const open = await waitForPopup();
      // "pri" fuzzy-matches the Price property; its row carries the value
      // type as detail and the field-type icon in the icon slot.
      const labels = optionLabels(open);
      expect(labels).toContain("Price");
      const priceRow = [...open.querySelectorAll("li")].find((li) =>
        li.textContent?.includes("Price")
      );
      expect(priceRow?.textContent).toContain("number");
      expect(
        priceRow?.querySelector(".cm-formula-completion-icon svg")
      ).not.toBeNull();
    });

    it("opens on the second line of a multi-statement draft", async () => {
      renderEditor();
      typeText("let t = 1;\npri");

      const open = await waitForPopup();
      expect(optionLabels(open)).toContain("Price");
    });

    it("applies a property completion as one canonical chip", async () => {
      const onChange = renderEditor();
      typeText("pri");
      await waitForPopup();
      await settleInteractionDelay();

      // Price is the top-ranked option; Enter accepts it.
      fireEvent.keyDown(cmContent(), { key: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith('prop("f-price")');
      await waitFor(() => {
        expect(document.querySelector(".cm-formula-chip")?.textContent).toBe(
          "Price"
        );
      });
      // Caret sits after the chip, ready to continue the expression.
      expect(editorView().state.selection.main.head).toBe(
        'prop("f-price")'.length
      );
    });

    it("completes scope roots and chains into the property list", async () => {
      const onChange = renderEditor();
      typeText("thi");

      const open = await waitForPopup();
      expect(optionLabels(open)).toContain("thisPage");
      expect(optionLabels(open)).toContain("thisRow");
      await settleInteractionDelay();

      fireEvent.keyDown(cmContent(), { key: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith("thisPage.");

      // Accepting reopens the popup; the trailing dot puts it in
      // property-only mode, and the pick replaces the whole reference.
      await waitForPopup();
      typeText("pri");
      await settleInteractionDelay();
      fireEvent.keyDown(cmContent(), { key: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith('prop("f-price")');
    });

    it("replaces a typed scope-root prefix along with the partial name", async () => {
      const onChange = renderEditor();
      typeText("thisPage.pri");
      await waitForPopup();
      await settleInteractionDelay();

      fireEvent.keyDown(cmContent(), { key: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith('prop("f-price")');
    });

    it("inserts functions as argument snippets (caret after the parens for zero-arg)", async () => {
      const onChange = renderEditor();
      typeText("roun");
      await waitForPopup();
      await settleInteractionDelay();
      fireEvent.keyDown(cmContent(), { key: "Enter" });
      // Parameterized functions land the placeholder snippet form with the
      // first placeholder selected — typing replaces it.
      expect(onChange).toHaveBeenLastCalledWith("round(value, digits?)");
      typeText("1.5");
      expect(onChange).toHaveBeenLastCalledWith("round(1.5, digits?)");

      // Move past the closing paren, then complete a zero-arg function.
      act(() => {
        const view = editorView();
        view.dispatch({ selection: { anchor: view.state.doc.length } });
      });
      typeText(" + toda");
      await waitForPopup();
      await settleInteractionDelay();
      fireEvent.keyDown(cmContent(), { key: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith(
        "round(1.5, digits?) + today()"
      );
      // Zero-argument function: caret lands AFTER the parens.
      expect(editorView().state.selection.main.head).toBe(
        "round(1.5, digits?) + today()".length
      );
    });

    it("accepts with Tab too", async () => {
      const onChange = renderEditor();
      typeText("upp");
      await waitForPopup();
      await settleInteractionDelay();
      fireEvent.keyDown(cmContent(), { key: "Tab" });
      expect(onChange).toHaveBeenLastCalledWith("upper(text)");
    });

    it("ranks type-fitting candidates first in an argument position", async () => {
      // Inside round( — a number argument — the number-typed Amount property
      // must outrank the alphabetically-earlier text-typed Alpha.
      renderEditor(vi.fn(), [
        { id: "f-alpha", name: "Alpha", type: "text" },
        { id: "f-amount", name: "Amount", type: "number" },
      ]);
      typeText("round(a");

      const open = await waitForPopup();
      const labels = optionLabels(open);
      expect(labels.indexOf("Amount")).toBeLessThan(labels.indexOf("Alpha"));
    });

    it("Escape closes the popup without bubbling while open, and bubbles when closed", async () => {
      const onOuterKeyDown = vi.fn();
      document.addEventListener("keydown", onOuterKeyDown);
      try {
        renderEditor();
        typeText("pri");
        await waitForPopup();

        // First Escape: consumed by the popup — the enclosing menu (the
        // document listener stands in for it) must not see it.
        fireEvent.keyDown(cmContent(), { key: "Escape" });
        expect(onOuterKeyDown).not.toHaveBeenCalled();
        await waitFor(() => {
          expect(popup()).toBeNull();
        });

        // Second Escape: no popup — bubbles so the menu closes.
        fireEvent.keyDown(cmContent(), { key: "Escape" });
        expect(onOuterKeyDown).toHaveBeenCalledTimes(1);
      } finally {
        document.removeEventListener("keydown", onOuterKeyDown);
      }
    });

    it("offers no completions inside string literals", async () => {
      renderEditor();
      typeText('"pri');
      await act(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 250);
          })
      );
      expect(popup()).toBeNull();
    });

    it("completes db and chains into the database-name list", async () => {
      const onChange = renderEditor(vi.fn(), FIELDS, DATABASES);
      typeText("db");

      const open = await waitForPopup();
      expect(optionLabels(open)).toContain("db");
      await settleInteractionDelay();

      // Accepting inserts the opener and reopens the popup, now filled with
      // database names (the db-argument position sits inside a string, so
      // this is the deliberate carve-out from the no-completions-in-strings
      // rule).
      fireEvent.keyDown(cmContent(), { key: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith('db("');
      const names = await waitForPopup();
      expect(optionLabels(names).sort()).toEqual(["Projects", "Tasks"]);
    });

    it("applies a database-name completion as one canonical db chip", async () => {
      const onChange = renderEditor(vi.fn(), FIELDS, DATABASES);
      typeText('db("Ta');
      await waitForPopup();
      await settleInteractionDelay();

      // Tasks is the only match; Enter accepts it — the WHOLE typed
      // reference (opener + partial name) is replaced by the canonical
      // id form, which renders as one atomic chip, caret after it.
      fireEvent.keyDown(cmContent(), { key: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith('db("db-tasks")');
      await waitFor(() => {
        expect(document.querySelector(".cm-formula-chip")?.textContent).toBe(
          "Tasks"
        );
      });
      expect(editorView().state.selection.main.head).toBe(
        'db("db-tasks")'.length
      );
    });

    it("offers no db entry without databases", async () => {
      // "db" matches nothing else in the catalog/schema, so with no
      // databases wired the popup must not open at all.
      renderEditor();
      typeText("db");
      await act(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 250);
          })
      );
      expect(popup()).toBeNull();
    });

    it("offers and/or/not once (keyword row only, no duplicate function form)", async () => {
      renderEditor();
      typeText("an");

      const open = await waitForPopup();
      const andRows = [...open.querySelectorAll("li")].filter(
        (row) => row.querySelector(".cm-completionLabel")?.textContent === "and"
      );
      expect(andRows).toHaveLength(1);
      // The surviving row is the keyword form — no signature detail.
      expect(andRows[0]?.querySelector(".cm-completionDetail")).toBeNull();
    });

    it("offers user-defined functions with their signature detail", async () => {
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={USER_FN_CONTEXT}
          fields={FIELDS}
          onChange={vi.fn()}
          value=""
        />
      );
      typeText("wei");

      const open = await waitForPopup();
      const labels = optionLabels(open);
      expect(labels).toContain("weightedScore");
      const row = [...open.querySelectorAll("li")].find(
        (li) =>
          li.querySelector(".cm-completionLabel")?.textContent ===
          "weightedScore"
      );
      expect(row?.querySelector(".cm-completionDetail")?.textContent).toBe(
        "(points, weight)"
      );
    });

    it("applies a user-function completion as a placeholder snippet", async () => {
      const onChange = vi.fn();
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={USER_FN_CONTEXT}
          fields={FIELDS}
          onChange={onChange}
          value=""
        />
      );
      typeText("weightedSc");
      await waitForPopup();
      await settleInteractionDelay();

      fireEvent.keyDown(cmContent(), { key: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith(
        "weightedScore(points, weight)"
      );
      // Parameter NAMES land as placeholder pills, first one selected.
      const pills = [
        ...document.querySelectorAll(".cm-formula-placeholder"),
      ].map((pill) => pill.textContent);
      expect(pills).toEqual(["points", "weight"]);
      const selection = editorView().state.selection.main;
      expect(selection.from).toBe("weightedScore(".length);
      expect(selection.to).toBe("weightedScore(points".length);
    });
  });

  describe("argument placeholders", () => {
    function renderEditor() {
      const editorRef = createRef<FormulaCodeEditorHandle>();
      const onChange = vi.fn();
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          editorRef={editorRef}
          fields={FIELDS}
          onChange={onChange}
          value=""
        />
      );
      return { editorRef, onChange };
    }

    function placeholderPills(): HTMLElement[] {
      return [...document.querySelectorAll(".cm-formula-placeholder")].filter(
        (element): element is HTMLElement => element instanceof HTMLElement
      );
    }

    function selectionRange(): { from: number; to: number } {
      const { main } = editorView().state.selection;
      return { from: main.from, to: main.to };
    }

    /** CM's post-open accept guard (see the autocomplete tests). */
    async function settleInteractionDelay(): Promise<void> {
      await act(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 100);
          })
      );
    }

    const SNIPPET = "dateAdd(date, amount, unit)";
    const DATE_RANGE = { from: "dateAdd(".length, to: "dateAdd(date".length };
    const AMOUNT_RANGE = {
      from: "dateAdd(date, ".length,
      to: "dateAdd(date, amount".length,
    };
    const UNIT_RANGE = {
      from: "dateAdd(date, amount, ".length,
      to: "dateAdd(date, amount, unit".length,
    };

    it("insertSnippet inserts plain labeled text, marks each argument, and selects the first", () => {
      const { editorRef, onChange } = renderEditor();
      act(() => {
        editorRef.current?.insertSnippet("dateAdd", ["date", "amount", "unit"]);
      });

      // The doc — and what onChange reports — is PLAIN text: the pills are
      // styling only, so nothing placeholder-ish can persist into a save.
      expect(onChange).toHaveBeenLastCalledWith(SNIPPET);
      expect(editorView().state.doc.toString()).toBe(SNIPPET);

      expect(placeholderPills().map((pill) => pill.textContent)).toEqual([
        "date",
        "amount",
        "unit",
      ]);
      // The first placeholder is selected, so typing replaces it.
      expect(selectionRange()).toEqual(DATE_RANGE);
    });

    it("typing over the selected placeholder replaces it and drops its mark", () => {
      const { editorRef, onChange } = renderEditor();
      act(() => {
        editorRef.current?.insertSnippet("dateAdd", ["date", "amount", "unit"]);
      });

      typeText("now()");
      expect(onChange).toHaveBeenLastCalledWith("dateAdd(now(), amount, unit)");
      expect(placeholderPills().map((pill) => pill.textContent)).toEqual([
        "amount",
        "unit",
      ]);
    });

    it("Tab selects the next placeholder and Shift-Tab the previous", () => {
      const { editorRef } = renderEditor();
      act(() => {
        editorRef.current?.insertSnippet("dateAdd", ["date", "amount", "unit"]);
      });

      fireEvent.keyDown(cmContent(), { key: "Tab" });
      expect(selectionRange()).toEqual(AMOUNT_RANGE);
      fireEvent.keyDown(cmContent(), { key: "Tab" });
      expect(selectionRange()).toEqual(UNIT_RANGE);
      fireEvent.keyDown(cmContent(), { key: "Tab", shiftKey: true });
      expect(selectionRange()).toEqual(AMOUNT_RANGE);
    });

    it("clicking a placeholder selects its whole range", () => {
      const { editorRef } = renderEditor();
      act(() => {
        editorRef.current?.insertSnippet("dateAdd", ["date", "amount", "unit"]);
      });

      const unit = placeholderPills().at(-1);
      if (unit === undefined) {
        throw new Error("placeholder pills not rendered");
      }
      // fireEvent returns false when preventDefault ran — the press is
      // consumed by the placeholder selection, not CM's caret placement.
      expect(fireEvent.mouseDown(unit)).toBe(false);
      expect(selectionRange()).toEqual(UNIT_RANGE);
    });

    it("accepting a parameterized completion lands the snippet with the first placeholder selected", async () => {
      const { onChange } = renderEditor();
      typeText("dateAd");
      await waitFor(() => {
        expect(
          document.querySelector(".cm-tooltip-autocomplete")
        ).not.toBeNull();
      });
      await settleInteractionDelay();

      fireEvent.keyDown(cmContent(), { key: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith(SNIPPET);
      expect(placeholderPills()).toHaveLength(3);
      expect(selectionRange()).toEqual(DATE_RANGE);
    });

    it("zero-param completions keep the caret after the parens, with no placeholders", async () => {
      const { onChange } = renderEditor();
      typeText("toda");
      await waitFor(() => {
        expect(
          document.querySelector(".cm-tooltip-autocomplete")
        ).not.toBeNull();
      });
      await settleInteractionDelay();

      fireEvent.keyDown(cmContent(), { key: "Enter" });
      expect(onChange).toHaveBeenLastCalledWith("today()");
      expect(placeholderPills()).toHaveLength(0);
      expect(selectionRange()).toEqual({
        from: "today()".length,
        to: "today()".length,
      });
    });
  });

  describe("diagnostics (squiggles)", () => {
    function renderEditor(value = "") {
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          fields={FIELDS}
          onChange={vi.fn()}
          value={value}
        />
      );
    }

    function squiggle(): HTMLElement | null {
      const element = document.querySelector(".cm-formula-diagnostic");
      return element instanceof HTMLElement ? element : null;
    }

    it("underlines a checker diagnostic after the debounce and clears it on fix", async () => {
      renderEditor();
      typeText('abs("oops")');

      // The debounced check lands ~150ms later; the squiggle covers exactly
      // the diagnosed argument span.
      await waitFor(() => {
        expect(squiggle()).not.toBeNull();
      });
      expect(squiggle()?.textContent).toBe('"oops"');

      // Fixing the type error clears the underline on the next pass.
      act(() => {
        const view = editorView();
        view.dispatch({
          changes: { from: 0, insert: "abs(1)", to: view.state.doc.length },
        });
      });
      await waitFor(() => {
        expect(squiggle()).toBeNull();
      });
    });

    it("underlines parse errors at the failure point", async () => {
      renderEditor();
      typeText("1 ++ 2");

      await waitFor(() => {
        expect(squiggle()).not.toBeNull();
      });
      expect(squiggle()?.textContent).toBe("+");
    });

    it("rings the whole chip when a diagnostic falls inside its span", async () => {
      // Note is text; abs() wants a number — the diagnostic span is the
      // canonical prop("f-note") text, which renders as one atomic chip. The
      // ring class lives on the widget itself (a wrapping mark would not
      // render around an atomic widget in real browsers).
      renderEditor('abs(prop("f-note"))');

      await waitFor(() => {
        expect(
          document.querySelector(".cm-formula-chip.cm-formula-chip-diagnosed")
        ).not.toBeNull();
      });

      // Fixing the argument drops the ring on the next pass.
      act(() => {
        const view = editorView();
        view.dispatch({
          changes: {
            from: 0,
            insert: 'lower(prop("f-note"))',
            to: view.state.doc.length,
          },
        });
      });
      await waitFor(() => {
        expect(document.querySelector(".cm-formula-chip-diagnosed")).toBeNull();
      });
      expect(document.querySelector(".cm-formula-chip")).not.toBeNull();
    });
  });

  describe("argument info card", () => {
    function renderEditor() {
      render(
        <FormulaCodeEditor
          ariaLabel="Formula expression"
          checkContext={CHECK_CONTEXT}
          fields={FIELDS}
          onChange={vi.fn()}
          value=""
        />
      );
    }

    function card(): HTMLElement | null {
      const element = document.querySelector(".cm-formula-infocard");
      return element instanceof HTMLElement ? element : null;
    }

    function activeParam(): string | undefined {
      return card()?.querySelector(".cm-formula-infocard-active")?.textContent;
    }

    it("shows the signature with the current argument emphasized", async () => {
      renderEditor();
      typeText("round(");

      await waitFor(() => {
        expect(card()).not.toBeNull();
      });
      expect(card()?.textContent).toContain("round(value, digits?)");
      expect(activeParam()).toBe("value");

      // Advancing past the comma moves the emphasis to the next parameter.
      typeText("1.5, ");
      await waitFor(() => {
        expect(activeParam()).toBe("digits?");
      });
    });

    it("offsets the argument index for dot-chained method calls", async () => {
      renderEditor();
      // The receiver occupies param 0 (`split(text, separator)`), so the
      // first typed argument is the separator.
      typeText('"a,b".split(');

      await waitFor(() => {
        expect(activeParam()).toBe("separator");
      });
    });

    it("shows the card inside a call on a later statement line", async () => {
      renderEditor();
      typeText("let t = 1;\nround(t, ");

      await waitFor(() => {
        expect(card()).not.toBeNull();
      });
      expect(card()?.textContent).toContain("round(value, digits?)");
      expect(activeParam()).toBe("digits?");
    });

    it("hides while the completion popup is open and returns on close", async () => {
      renderEditor();
      typeText("round(pri");

      await waitFor(() => {
        expect(
          document.querySelector(".cm-tooltip-autocomplete")
        ).not.toBeNull();
      });
      expect(card()).toBeNull();

      // Escape closes only the popup; the info card comes back.
      fireEvent.keyDown(cmContent(), { key: "Escape" });
      await waitFor(() => {
        expect(card()).not.toBeNull();
      });
      expect(activeParam()).toBe("value");
    });

    it("shows no card at the top level", async () => {
      renderEditor();
      typeText("1 + 2");
      await act(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 50);
          })
      );
      expect(card()).toBeNull();
    });
  });
});
