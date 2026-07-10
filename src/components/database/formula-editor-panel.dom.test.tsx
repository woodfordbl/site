/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FormulaCodeEditorBoundary,
  FormulaEditorPanel,
} from "@/components/database/formula-editor-panel.tsx";
import type { DatabaseField } from "@/lib/schemas/database.ts";

// Coarse pointers keep the plain textarea (the CM6 code editor is the fine-
// pointer path), so most cases run with `coarse: true` to exercise the
// textarea surface without CM6/jsdom scaffolding; the code-editor block
// flips it to false. Stubbed so no DeviceLayoutProvider/matchMedia is needed.
const pointer = vi.hoisted(() => ({ coarse: true }));
vi.mock("@/hooks/device-layout.ts", () => ({
  useIsCoarsePrimaryPointer: () => pointer.coarse,
}));

const FIELDS: DatabaseField[] = [
  { id: "f-price", name: "Price", type: "number" },
  { id: "f-qty", name: "Unit Count", type: "number" },
  { id: "f-total", name: "Total", type: "formula", expression: "" },
];

const FIRST_ROW_VALUES = { "f-price": 10, "f-qty": 4 };

const PARSE_ERROR_RE = /Unexpected end of expression/;

// Status-row position expectations (display coordinates, not canonical).
const ABS_DIAG_AT_22_RE = /abs\(\) expects .*\(at character 22\)/;
const ABS_DIAG_AT_13_RE = /abs\(\) expects .*\(at character 13\)/;
const PARSE_ERROR_AT_8_RE = /Unexpected end of expression.*\(at character 8\)/;

/** Flush the panel's rAF-based focus/caret restoration (stubbed to timeouts). */
function flushFrames(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

beforeEach(() => {
  pointer.coarse = true;
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0) as unknown as number
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    clearTimeout(id);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPanel(onSave = vi.fn(), expression = "") {
  render(
    <FormulaEditorPanel
      expression={expression}
      fields={FIELDS}
      firstRowValues={FIRST_ROW_VALUES}
      onSave={onSave}
    />
  );
  return onSave;
}

describe("FormulaEditorPanel", () => {
  it("searches, inserts a function then a property at the caret, and previews", async () => {
    renderPanel();
    await flushFrames();

    const textarea = screen.getByLabelText("Formula expression");
    const search = screen.getByLabelText(
      "Search properties, functions, and operators"
    );

    // Search narrows the reference list to the average function.
    fireEvent.change(search, { target: { value: "aver" } });
    expect(screen.queryByText("sum")).toBeNull();
    expect(screen.queryByText("Price")).toBeNull();

    // Tapping the function inserts `average()` with the caret inside parens.
    fireEvent.click(screen.getByText("average"));
    await flushFrames();
    expect((textarea as HTMLTextAreaElement).value).toBe("average()");
    expect((textarea as HTMLTextAreaElement).selectionStart).toBe(
      "average(".length
    );

    // Clearing the search brings Properties back; tapping one inserts a
    // thisPage reference at the caret (inside the parens).
    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(screen.getByText("Price"));
    await flushFrames();
    expect((textarea as HTMLTextAreaElement).value).toBe(
      "average(thisPage.Price)"
    );

    // Live parse status + first-row preview.
    expect(screen.getByText("✓ Valid")).toBeDefined();
    expect(screen.getByText("Preview: 10")).toBeDefined();
  });

  it("uses the bracket form for non-identifier property names", async () => {
    renderPanel();
    await flushFrames();

    fireEvent.click(screen.getByText("Unit Count"));
    await flushFrames();

    const textarea = screen.getByLabelText(
      "Formula expression"
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('thisPage["Unit Count"]');
    // Bracket references resolve like any other property in the preview.
    expect(screen.getByText("Preview: 4")).toBeDefined();
  });

  it("lists formula fields as Properties and previews errors honestly", async () => {
    renderPanel();
    await flushFrames();

    // v2: formula fields are insertable references too (formulas may
    // reference other formulas; a self-reference surfaces as a cycle error).
    expect(screen.getByText("Total")).toBeDefined();

    const textarea = screen.getByLabelText("Formula expression");
    fireEvent.change(textarea, { target: { value: "1 / 0" } });
    expect(screen.getByText("Preview: ⚠ Division by zero")).toBeDefined();

    fireEvent.change(textarea, { target: { value: "1 +" } });
    expect(screen.getByText(PARSE_ERROR_RE)).toBeDefined();
  });

  it("hands the field-id canonical draft to onSave", async () => {
    const onSave = renderPanel();
    await flushFrames();

    const textarea = screen.getByLabelText("Formula expression");
    fireEvent.change(textarea, { target: { value: "thisPage.Price * 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith('prop("f-price") * 2');
  });

  it("disables Save for unparseable drafts, but not for blank ones", async () => {
    const onSave = renderPanel();
    await flushFrames();

    const textarea = screen.getByLabelText("Formula expression");
    fireEvent.change(textarea, { target: { value: "1 +" } });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();

    // Clearing a formula stays saveable (blank draft = no parse to fail).
    fireEvent.change(textarea, { target: { value: "  " } });
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith("  ");
  });

  it("keeps Save enabled when only checker diagnostics are present", async () => {
    const onSave = renderPanel();
    await flushFrames();

    const textarea = screen.getByLabelText("Formula expression");
    fireEvent.change(textarea, { target: { value: 'abs("oops")' } });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith('abs("oops")');
  });

  it("humanizes stored canonical expressions into the draft", async () => {
    renderPanel(vi.fn(), 'prop("f-price") * prop("f-qty")');
    await flushFrames();

    const textarea = screen.getByLabelText(
      "Formula expression"
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('thisPage.Price * thisPage["Unit Count"]');
    // The draft behind the display text is canonical, so the preview
    // evaluates ids directly (no humanize round-trip).
    expect(screen.getByText("Preview: 40")).toBeDefined();
  });

  it("reports status positions in DISPLAY coordinates on the textarea path", async () => {
    renderPanel();
    await flushFrames();

    // Display: thisPage.Price + abs("oops") — the draft behind it is the
    // canonical prop("f-price") + abs("oops"), where `"oops"` sits at
    // canonical offset 22 but DISPLAY offset 21. The status row must index
    // the text the user sees: character 22, not the canonical 23.
    const textarea = screen.getByLabelText("Formula expression");
    fireEvent.change(textarea, {
      target: { value: 'thisPage.Price + abs("oops")' },
    });
    expect(screen.getByText(ABS_DIAG_AT_22_RE)).toBeDefined();
  });

  it("keeps the textarea display stable across the humanize∘canonicalize loop", async () => {
    const onSave = renderPanel();
    await flushFrames();
    const textarea = screen.getByLabelText(
      "Formula expression"
    ) as HTMLTextAreaElement;

    // Parseable display text round-trips to itself: each change is
    // canonicalized into the draft and humanized back for display.
    fireEvent.change(textarea, { target: { value: "thisPage.Price + 1" } });
    expect(textarea.value).toBe("thisPage.Price + 1");

    // Unparseable text passes through BOTH rewriters unchanged (identity),
    // so mid-keystroke states never jump.
    fireEvent.change(textarea, { target: { value: "thisPage.Price +" } });
    expect(textarea.value).toBe("thisPage.Price +");

    // Pasted canonical text is legible: the display humanizes it while the
    // saved draft stays canonical.
    fireEvent.change(textarea, { target: { value: 'prop("f-qty") * 2' } });
    expect(textarea.value).toBe('thisPage["Unit Count"] * 2');
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith('prop("f-qty") * 2');
  });

  describe("code editor (fine pointers)", () => {
    beforeEach(() => {
      pointer.coarse = false;
      // jsdom has no layout; CM6 measures text via Range geometry. Empty
      // rects are enough for mount + dispatch.
      Range.prototype.getClientRects = () =>
        ({
          length: 0,
          item: () => null,
          [Symbol.iterator]: [][Symbol.iterator],
        }) as unknown as DOMRectList;
      Range.prototype.getBoundingClientRect = () =>
        ({
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    });

    it("mounts CM6 lazily, inserts through its caret API, and saves canonical text", async () => {
      const onSave = renderPanel();

      // The textarea renders as the Suspense fallback until the lazy CM6
      // chunk resolves and replaces it.
      expect(screen.getByLabelText("Formula expression").tagName).toBe(
        "TEXTAREA"
      );
      await waitFor(() => {
        expect(document.querySelector(".cm-content")).not.toBeNull();
      });
      expect(document.querySelector("textarea")).toBeNull();

      // Reference-list insertion goes through the editor handle: function
      // first (caret lands inside the parens), then a property at the caret —
      // inserted as canonical `prop("<id>")` text, which renders as an atomic
      // chip labeled with the field's name.
      fireEvent.click(screen.getByText("average"));
      fireEvent.click(screen.getByText("Price"));
      await waitFor(() => {
        expect(screen.getByText("Preview: 10")).toBeDefined();
      });
      const chip = document.querySelector(".cm-formula-chip");
      expect(chip?.textContent).toBe("Price");

      // Mod+Enter saves (same gate as the button)…
      const content = document.querySelector(".cm-content") as HTMLElement;
      fireEvent.keyDown(content, { key: "Enter", ctrlKey: true });
      expect(onSave).toHaveBeenCalledWith('average(prop("f-price"))');

      // …and so does the Save button (the draft is already canonical; the
      // final canonicalize pass is an idempotent no-op).
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave).toHaveBeenLastCalledWith('average(prop("f-price"))');
    });

    it("relabels open chips when a field is renamed while editing", async () => {
      const expression = 'prop("f-price") * 2';
      const panelWith = (fields: DatabaseField[]) => (
        <FormulaEditorPanel
          expression={expression}
          fields={fields}
          firstRowValues={FIRST_ROW_VALUES}
          onSave={vi.fn()}
        />
      );
      const { rerender } = render(panelWith(FIELDS));

      await waitFor(() => {
        expect(document.querySelector(".cm-formula-chip")).not.toBeNull();
      });
      expect(document.querySelector(".cm-formula-chip")?.textContent).toBe(
        "Price"
      );

      // Rename lands as a new fields prop; the open chip relabels in place.
      rerender(
        panelWith(
          FIELDS.map((field) =>
            field.id === "f-price" ? { ...field, name: "Cost" } : field
          )
        )
      );
      expect(document.querySelector(".cm-formula-chip")?.textContent).toBe(
        "Cost"
      );
    });

    it("reports status positions in chip-label coordinates", async () => {
      // Canonical draft: prop("f-price") + abs("oops") — the chip renders as
      // the 5-char label "Price", so what the user sees is
      // `Price + abs("oops")` with `"oops"` at offset 12 → character 13
      // (canonical numbering would claim 23).
      renderPanel(vi.fn(), 'prop("f-price") + abs("oops")');
      await waitFor(() => {
        expect(document.querySelector(".cm-formula-chip")).not.toBeNull();
      });
      expect(screen.getByText(ABS_DIAG_AT_13_RE)).toBeDefined();
    });

    it("maps parse-error positions through chip labels too", async () => {
      // prop("f-price") + → visible as `Price + `; the dangling-operator
      // parse error points at display offset 7 → character 8.
      renderPanel(vi.fn(), 'prop("f-price") +');
      await waitFor(() => {
        expect(document.querySelector(".cm-formula-chip")).not.toBeNull();
      });
      expect(screen.getByText(PARSE_ERROR_AT_8_RE)).toBeDefined();
    });

    it("degrades to the fallback when the editor fails to mount", () => {
      // Stands in for a chunk-fetch failure (stale deploy hash, offline).
      function ExplodingEditor(): ReactNode {
        throw new Error("Failed to fetch dynamically imported module");
      }
      // React logs caught boundary errors; keep the test output clean.
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        render(
          <FormulaCodeEditorBoundary
            fallback={<textarea aria-label="Formula expression" />}
          >
            <ExplodingEditor />
          </FormulaCodeEditorBoundary>
        );
        expect(screen.getByLabelText("Formula expression").tagName).toBe(
          "TEXTAREA"
        );
      } finally {
        consoleError.mockRestore();
      }
    });
  });
});
