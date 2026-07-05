/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormulaEditorPanel } from "@/components/database/formula-editor-panel.tsx";
import {
  serializeFormulaDom,
  setFormulaCaret,
} from "@/lib/editor/formula-dom.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

// The panel only reads the coarse-pointer hint for row sizing; stub it so the
// test needs no DeviceLayoutProvider/matchMedia scaffolding.
vi.mock("@/hooks/device-layout.ts", () => ({
  useIsCoarsePrimaryPointer: () => false,
}));

const FIELDS: DatabaseField[] = [
  { id: "f-price", name: "Price", type: "number" },
  { id: "f-name", name: "Name", type: "text" },
  { id: "f-qty", name: "Unit Count", type: "number" },
  { id: "f-total", name: "Total", type: "formula", expression: "" },
];

const FIRST_ROW_VALUES = { "f-price": 10, "f-qty": 4 };

const VALID_NUMBER_RE = /✓ Valid · number/;

/** Flush the field's rAF-based caret restoration (stubbed to timeouts). */
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

function renderPanel(expression = "", onSave = vi.fn()) {
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

function field(): HTMLElement {
  return screen.getByLabelText("Formula expression");
}

describe("FormulaEditorPanel", () => {
  it("renders an existing formula with a property chip, type, and preview", async () => {
    renderPanel("thisPage.Price * 2");
    await flushFrames();

    // The property renders as a chip carrying its source and showing the name.
    const chip = field().querySelector("[data-formula-chip]");
    expect(chip?.getAttribute("data-source")).toBe("thisPage.Price");
    expect(chip?.textContent).toContain("Price");
    // Serializing the field round-trips to the exact source.
    expect(serializeFormulaDom(field())).toBe("thisPage.Price * 2");

    expect(screen.getByText(VALID_NUMBER_RE)).toBeDefined();
    expect(screen.getByText("Preview: 20")).toBeDefined();
  });

  it("filters the reference list as you search", () => {
    renderPanel();
    const search = screen.getByLabelText(
      "Search properties, functions, and operators"
    );
    fireEvent.change(search, { target: { value: "aver" } });
    expect(screen.queryByText("sum")).toBeNull();
    expect(screen.queryByText("Price")).toBeNull();
    expect(screen.getByText("average")).toBeDefined();
  });

  it("inserts references into the field (source round-trips through chips)", async () => {
    renderPanel();
    await flushFrames();

    fireEvent.click(screen.getByText("average"));
    await flushFrames();
    expect(serializeFormulaDom(field())).toBe("average()");

    fireEvent.click(screen.getByText("Price"));
    await flushFrames();
    // The function insert leaves the caret inside its parens, so the property
    // lands there; it serializes back to its full source via the chip.
    expect(serializeFormulaDom(field())).toBe("average(Page.Price)");
  });

  it("suggests type-appropriate methods after a value's dot, and chains them", async () => {
    // Caret sits right after `Page.Name.` (Name is text).
    renderPanel("Page.Name.");
    await flushFrames();
    const el = field();
    setFormulaCaret(el, { start: 10, end: 10 });
    fireEvent.keyUp(el); // reports the caret → panel recomputes context

    // Text methods are recommended; number-only methods are not.
    expect(screen.getByText("upper")).toBeDefined();
    expect(screen.getByText("len")).toBeDefined();
    expect(screen.queryByText("round")).toBeNull();

    fireEvent.click(screen.getByText("upper"));
    await flushFrames();
    expect(serializeFormulaDom(field())).toBe("Page.Name.upper()");
  });

  it("deletes a whole property chip on Backspace", async () => {
    renderPanel("thisPage.Price");
    await flushFrames();
    const el = field();
    const end = "thisPage.Price".length;
    setFormulaCaret(el, { start: end, end });

    fireEvent.keyDown(el, { key: "Backspace" });
    await flushFrames();
    // The entire reference is removed, not just a character of its label.
    expect(serializeFormulaDom(el)).toBe("");
  });

  it("excludes formula fields from Properties and previews errors honestly", async () => {
    renderPanel("1 / 0");
    await flushFrames();

    // The formula field itself must not be insertable.
    expect(screen.queryByText("Total")).toBeNull();
    expect(screen.getByText("Preview: ⚠ Division by zero")).toBeDefined();
  });

  it("hands the current draft to onSave", async () => {
    const onSave = renderPanel("thisPage.Price * 2");
    await flushFrames();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("thisPage.Price * 2");
  });
});
