/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormulaEditorPanel } from "@/components/database/formula-editor-panel.tsx";
import type { DatabaseField } from "@/lib/schemas/database.ts";

// The panel only reads the coarse-pointer hint for row sizing; stub it so the
// test needs no DeviceLayoutProvider/matchMedia scaffolding.
vi.mock("@/hooks/device-layout.ts", () => ({
  useIsCoarsePrimaryPointer: () => false,
}));

const FIELDS: DatabaseField[] = [
  { id: "f-price", name: "Price", type: "number" },
  { id: "f-qty", name: "Unit Count", type: "number" },
  { id: "f-total", name: "Total", type: "formula", expression: "" },
];

const FIRST_ROW_VALUES = { "f-price": 10, "f-qty": 4 };

const PARSE_ERROR_RE = /Unexpected end of expression/;

/** Flush the panel's rAF-based focus/caret restoration (stubbed to timeouts). */
function flushFrames(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

beforeEach(() => {
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

  it("excludes formula fields from Properties and previews errors honestly", async () => {
    renderPanel();
    await flushFrames();

    // The formula field itself must not be insertable.
    expect(screen.queryByText("Total")).toBeNull();

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

  it("hands unparseable drafts to onSave unchanged", async () => {
    const onSave = renderPanel();
    await flushFrames();

    const textarea = screen.getByLabelText("Formula expression");
    fireEvent.change(textarea, { target: { value: "1 +" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("1 +");
  });

  it("humanizes stored canonical expressions into the draft", async () => {
    renderPanel(vi.fn(), 'prop("f-price") * prop("f-qty")');
    await flushFrames();

    const textarea = screen.getByLabelText(
      "Formula expression"
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('thisPage.Price * thisPage["Unit Count"]');
    // Name resolution keeps the live preview working on the display text.
    expect(screen.getByText("Preview: 40")).toBeDefined();
  });
});
