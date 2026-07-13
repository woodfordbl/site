/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormulaChipMenu } from "@/components/database/formula-chip-menu.tsx";
import {
  FormulaCodeEditorBoundary,
  FormulaEditorPanel,
} from "@/components/database/formula-editor-panel.tsx";
import type { FormulaRelatedDatabase } from "@/lib/databases/formula-values.ts";
import type { FormulaRelationResolver } from "@/lib/formula/values.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

// Coarse pointers keep the plain textarea (the CM6 code editor is the fine-
// pointer path), so most cases run with `coarse: true` to exercise the
// textarea surface without CM6/jsdom scaffolding; the code-editor block
// flips it to false. Stubbed so no DeviceLayoutProvider/matchMedia is needed.
const pointer = vi.hoisted(() => ({ coarse: true }));
vi.mock("@/hooks/device-layout.ts", () => ({
  useIsCoarsePrimaryPointer: () => pointer.coarse,
}));

// The sheet layout mounts CM6 even on coarse pointers. The sheet tests flip
// this to keep the lazy editor suspended forever, so the Suspense fallback
// textarea stays the editing surface DETERMINISTICALLY (otherwise the lazy
// chunk resolves mid-test and swaps surfaces under the assertions); the
// fine-pointer block leaves it false and exercises the real CM6.
const cm6 = vi.hoisted(() => ({ suppressMount: false }));
vi.mock(
  "@/components/database/formula-code-editor.tsx",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/components/database/formula-code-editor.tsx")
      >();
    const react = await import("react");
    /** Never settles — suspends the editor so the fallback textarea persists. */
    const pending = new Promise<never>(() => undefined);
    function SuppressibleFormulaCodeEditor(
      props: Parameters<typeof actual.FormulaCodeEditor>[0]
    ) {
      if (cm6.suppressMount) {
        react.use(pending);
      }
      return react.createElement(actual.FormulaCodeEditor, props);
    }
    return { ...actual, FormulaCodeEditor: SuppressibleFormulaCodeEditor };
  }
);

// The accessory row pins itself above the on-screen keyboard by driving a
// per-frame transform off `visualViewport` — none of which exists in jsdom,
// and none of which is what these tests assert. Stub the anchor hook.
vi.mock("@/hooks/use-visual-viewport-keyboard.ts", () => ({
  useKeyboardToolbarAnchor: () => undefined,
}));

const FIELDS: DatabaseField[] = [
  { id: "f-price", name: "Price", type: "number" },
  { id: "f-qty", name: "Unit Count", type: "number" },
  { id: "f-total", name: "Total", type: "formula", expression: "" },
];

const FIRST_ROW_VALUES = { "f-price": 10, "f-qty": 4 };

const PREVIEW_ROWS = [
  { id: "row-1", label: "First row", values: FIRST_ROW_VALUES },
];

// Workspace databases for db("…") reference threading (name↔id rewriting,
// db chips, and the chip menu's Change-database list).
const RELATED_DATABASES: FormulaRelatedDatabase[] = [
  {
    fields: [{ id: "t-hours", name: "Hours", type: "number" }],
    id: "db-tasks",
    name: "Tasks",
  },
  { fields: [], id: "db-projects", name: "Projects" },
];

const PARSE_ERROR_RE = /Unexpected end of expression/;

// Status-row position expectations (display coordinates, not canonical).
// Anchored on the "(at character N)" suffix only the status message carries,
// so the live preview's own "⚠ abs() expects…" rendering never matches.
const ABS_DIAG_RE = /abs\(\) expects .*\(at character \d+\)/;
const ABS_DIAG_AT_22_RE = /abs\(\) expects .*\(at character 22\)/;
const ABS_DIAG_AT_13_RE = /abs\(\) expects .*\(at character 13\)/;
const ABS_DIAG_AT_28_RE = /abs\(\) expects .*\(at character 28\)/;
const PARSE_ERROR_AT_8_RE = /Unexpected end of expression.*\(at character 8\)/;
const NOT_A_TASKS_PROPERTY_RE = /isn't a property of Tasks/;
const ROLLUP_TITLE_RE = /Rollup: /;

/** Flush the panel's rAF-based focus/caret restoration (stubbed to timeouts). */
function flushFrames(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

beforeEach(() => {
  pointer.coarse = true;
  cm6.suppressMount = false;
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
      onSave={onSave}
      previewRows={PREVIEW_ROWS}
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

  it("disables Save when checker diagnostics are present", async () => {
    // Save/Done require a VALID formula: checker diagnostics block the write
    // just like parse errors do (broken drafts never persist).
    const onSave = renderPanel();
    await flushFrames();

    const textarea = screen.getByLabelText("Formula expression");
    fireEvent.change(textarea, { target: { value: 'abs("oops")' } });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();

    // Fixing the diagnostic re-enables Save.
    fireEvent.change(textarea, { target: { value: "abs(-2)" } });
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith("abs(-2)");
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

  describe("db references (textarea path)", () => {
    function renderWithDatabases(onSave = vi.fn(), expression = "") {
      render(
        <FormulaEditorPanel
          expression={expression}
          fields={FIELDS}
          onSave={onSave}
          previewRows={PREVIEW_ROWS}
          relatedDatabases={RELATED_DATABASES}
        />
      );
      return onSave;
    }

    it("displays canonical db drafts by name and re-canonicalizes on save", async () => {
      const onSave = renderWithDatabases(vi.fn(), 'db("db-tasks").length()');
      await flushFrames();

      // The stored canonical id form humanizes to the database NAME.
      const textarea = screen.getByLabelText(
        "Formula expression"
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe('db("Tasks").length()');

      // Typed name forms canonicalize into the draft on every change while
      // the display keeps the name (humanize∘canonicalize is stable) …
      fireEvent.change(textarea, {
        target: { value: 'db("Projects").length()' },
      });
      expect(textarea.value).toBe('db("Projects").length()');

      // … and Save hands up the canonical id form.
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalledWith('db("db-projects").length()');
    });

    it("maps status positions past db spans in display coordinates", async () => {
      renderWithDatabases();
      await flushFrames();

      // Display: db("Tasks").length() + abs("oops") — the canonical draft
      // holds db("db-tasks") (3 characters longer), so `"oops"` sits at
      // canonical offset 30 but DISPLAY offset 27 → character 28.
      fireEvent.change(screen.getByLabelText("Formula expression"), {
        target: { value: 'db("Tasks").length() + abs("oops")' },
      });
      expect(screen.getByText(ABS_DIAG_AT_28_RE)).toBeDefined();
    });
  });

  describe("relations", () => {
    const relationFields: DatabaseField[] = [
      { id: "f-rel", name: "Rel", targetDatabaseId: "db-t", type: "relation" },
      { id: "f-roll", name: "Rollup", type: "formula", expression: "" },
    ];
    const targetFields: DatabaseField[] = [
      { id: "t-name", name: "Name", type: "text" },
      { id: "t-est", name: "Estimate", type: "number" },
    ];
    const targetRows: Record<string, Record<string, string | number>> = {
      r1: { "t-est": 3, "t-name": "Alpha" },
      r2: { "t-est": 4, "t-name": "Beta" },
    };
    const relatedDatabases: FormulaRelatedDatabase[] = [
      { fields: targetFields, id: "db-t", name: "Tasks" },
    ];
    const relations: FormulaRelationResolver = {
      database: (databaseId) =>
        databaseId === "db-t"
          ? {
              fields: targetFields,
              name: "Tasks",
              primaryFieldId: "t-name",
              row: (rowId) => targetRows[rowId] ?? null,
            }
          : null,
    };

    it("previews a relation rollup when relatedDatabases/relations are provided", async () => {
      render(
        <FormulaEditorPanel
          expression=""
          fields={relationFields}
          onSave={vi.fn()}
          previewRows={[
            {
              id: "row-1",
              label: "First row",
              values: { "f-rel": ["r1", "r2"] },
            },
          ]}
          relatedDatabases={relatedDatabases}
          relations={relations}
        />
      );
      await flushFrames();

      const textarea = screen.getByLabelText("Formula expression");
      fireEvent.change(textarea, {
        target: { value: "thisPage.Rel.map(r => r.Estimate).sum()" },
      });
      // Checker: member typed by name against the target schema → clean.
      expect(screen.getByText("✓ Valid")).toBeDefined();
      expect(screen.getByText("number")).toBeDefined();
      // Preview: 3 + 4 over the stub resolver's target rows.
      expect(screen.getByText("Preview: 7")).toBeDefined();

      // Unknown members diagnose with the target database's name — in the
      // status row (checker) AND the preview (the runtime's matching error).
      fireEvent.change(textarea, {
        target: { value: "thisPage.Rel.map(r => r.Nope).sum()" },
      });
      expect(
        screen.getAllByText(NOT_A_TASKS_PROPERTY_RE).length
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe("wide layout (formula dialog)", () => {
    it("drops the panel's own heading and keeps the working parts", async () => {
      const onSave = vi.fn();
      render(
        <FormulaEditorPanel
          expression=""
          fields={FIELDS}
          layout="wide"
          onSave={onSave}
          previewRows={PREVIEW_ROWS}
        />
      );
      await flushFrames();

      // The host dialog owns the title, so no inner "Formula" label.
      expect(screen.queryByText("Formula")).toBeNull();

      // Editor, reference list, and Save all still wired.
      const textarea = screen.getByLabelText("Formula expression");
      fireEvent.change(textarea, { target: { value: "thisPage.Price * 2" } });
      expect(screen.getByText("✓ Valid")).toBeDefined();
      expect(screen.getByText("Price")).toBeDefined();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalledWith('prop("f-price") * 2');
    });
  });

  describe("rollup wizard", () => {
    const relationFields: DatabaseField[] = [
      { id: "f-rel", name: "Rel", targetDatabaseId: "db-t", type: "relation" },
    ];
    const relatedDatabases: FormulaRelatedDatabase[] = [
      {
        fields: [
          { id: "t-name", name: "Name", type: "text" },
          { id: "t-est", name: "Estimate", type: "number" },
        ],
        id: "db-t",
        name: "Tasks",
      },
    ];

    it("hides the Rollup affordance without a resolvable relation", async () => {
      renderPanel();
      await flushFrames();
      expect(screen.queryByText("Rollup")).toBeNull();

      cleanup();
      // A relation field whose target isn't in relatedDatabases doesn't
      // count either — the wizard would open onto an empty step.
      render(
        <FormulaEditorPanel
          expression=""
          fields={relationFields}
          onSave={vi.fn()}
          previewRows={[]}
        />
      );
      await flushFrames();
      expect(screen.queryByText("Rollup")).toBeNull();
    });

    it("walks relation → property → aggregation and inserts the humanized formula", async () => {
      render(
        <FormulaEditorPanel
          expression=""
          fields={relationFields}
          onSave={vi.fn()}
          previewRows={[
            { id: "row-1", label: "First row", values: { "f-rel": [] } },
          ]}
          relatedDatabases={relatedDatabases}
        />
      );
      await flushFrames();

      fireEvent.click(screen.getByText("Rollup"));
      expect(screen.getByText("Rollup: Which relation?")).toBeDefined();
      // The wizard replaces the search + reference list while open.
      expect(
        screen.queryByLabelText("Search properties, functions, and operators")
      ).toBeNull();

      fireEvent.click(screen.getByText("Rel"));
      expect(screen.getByText("Rollup: Which property?")).toBeDefined();
      expect(screen.getByText("All rows")).toBeDefined();

      fireEvent.click(screen.getByText("Estimate"));
      expect(screen.getByText("Rollup: How to roll up?")).toBeDefined();

      fireEvent.click(screen.getByText("Sum"));
      await flushFrames();

      // Textarea drafts live in display coordinates: the generated canonical
      // text lands humanized, and the wizard closes back to the reference UI.
      const textarea = screen.getByLabelText(
        "Formula expression"
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("thisPage.Rel.map(r => r.Estimate).sum()");
      expect(textarea.selectionStart).toBe(textarea.value.length);
      expect(screen.getByText("✓ Valid")).toBeDefined();
      expect(screen.queryByText(ROLLUP_TITLE_RE)).toBeNull();
    });

    it("counts rows when aggregating without a property", async () => {
      render(
        <FormulaEditorPanel
          expression=""
          fields={relationFields}
          onSave={vi.fn()}
          previewRows={[]}
          relatedDatabases={relatedDatabases}
        />
      );
      await flushFrames();

      fireEvent.click(screen.getByText("Rollup"));
      fireEvent.click(screen.getByText("Rel"));
      fireEvent.click(screen.getByText("All rows"));
      fireEvent.click(screen.getByText("Count rows"));
      await flushFrames();

      const textarea = screen.getByLabelText(
        "Formula expression"
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("thisPage.Rel.length()");
    });

    it("steps back through the wizard and closes from the first step", async () => {
      render(
        <FormulaEditorPanel
          expression=""
          fields={relationFields}
          onSave={vi.fn()}
          previewRows={[]}
          relatedDatabases={relatedDatabases}
        />
      );
      await flushFrames();

      fireEvent.click(screen.getByText("Rollup"));
      fireEvent.click(screen.getByText("Rel"));
      expect(screen.getByText("Rollup: Which property?")).toBeDefined();

      fireEvent.click(screen.getByLabelText("Back"));
      expect(screen.getByText("Rollup: Which relation?")).toBeDefined();

      fireEvent.click(screen.getByLabelText("Back"));
      expect(screen.queryByText(ROLLUP_TITLE_RE)).toBeNull();
      expect(
        screen.getByLabelText("Search properties, functions, and operators")
      ).toBeDefined();
    });
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

    it("inserts reference-list functions as argument-placeholder snippets", async () => {
      renderPanel();
      await waitFor(() => {
        expect(document.querySelector(".cm-content")).not.toBeNull();
      });

      const search = screen.getByLabelText(
        "Search properties, functions, and operators"
      );
      fireEvent.change(search, { target: { value: "dateAdd" } });
      fireEvent.click(screen.getByText("dateAdd"));

      // The CM6 surface receives the snippet form — the catalog's param
      // labels as PLAIN doc text, each wrapped in a placeholder pill, so the
      // draft is honest text the parser sees directly.
      await waitFor(() => {
        expect(document.querySelector(".cm-content")?.textContent).toContain(
          "dateAdd(date, amount, unit)"
        );
      });
      expect(
        [...document.querySelectorAll(".cm-formula-placeholder")].map(
          (pill) => pill.textContent
        )
      ).toEqual(["date", "amount", "unit"]);
    });

    it("relabels open chips when a field is renamed while editing", async () => {
      const expression = 'prop("f-price") * 2';
      const panelWith = (fields: DatabaseField[]) => (
        <FormulaEditorPanel
          expression={expression}
          fields={fields}
          onSave={vi.fn()}
          previewRows={PREVIEW_ROWS}
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

    /** {@link renderPanel} with the workspace databases threaded through. */
    function renderPanelWithDatabases(onSave = vi.fn(), expression = "") {
      render(
        <FormulaEditorPanel
          expression={expression}
          fields={FIELDS}
          onSave={onSave}
          previewRows={PREVIEW_ROWS}
          relatedDatabases={RELATED_DATABASES}
        />
      );
      return onSave;
    }

    it("renders db chips and maps status positions through their labels", async () => {
      renderPanelWithDatabases(
        vi.fn(),
        'db("db-tasks").length() + abs("oops")'
      );

      await waitFor(() => {
        expect(document.querySelector(".cm-formula-chip")).not.toBeNull();
      });
      expect(document.querySelector(".cm-formula-chip")?.textContent).toBe(
        "Tasks"
      );
      // Display: Tasks.length() + abs("oops") — the chip renders as the
      // 5-char label "Tasks", so `"oops"` sits at display offset 21 →
      // character 22 (canonical numbering would claim 31).
      expect(screen.getByText(ABS_DIAG_AT_22_RE)).toBeDefined();
    });

    describe("chip option menu", () => {
      beforeEach(() => {
        // Base UI's popover positioner observes size; jsdom lacks
        // ResizeObserver (same stub as the relation cell editor tests).
        vi.stubGlobal(
          "ResizeObserver",
          class {
            observe() {
              /* no-op */
            }
            unobserve() {
              /* no-op */
            }
            disconnect() {
              /* no-op */
            }
          }
        );
        // With ResizeObserver present, Base UI's ScrollArea (the reference
        // list) reaches its animation bookkeeping; jsdom lacks that too.
        Element.prototype.getAnimations = () => [];
      });

      /** Wait for the CM6 chip, tap it, and return the opened menu popup. */
      async function tapChip(): Promise<HTMLElement> {
        await waitFor(() => {
          expect(document.querySelector(".cm-formula-chip")).not.toBeNull();
        });
        fireEvent.click(
          document.querySelector(".cm-formula-chip") as HTMLElement
        );
        return await waitFor(() => {
          const popup = document.querySelector("[data-slot='popover-content']");
          expect(popup).not.toBeNull();
          return popup as HTMLElement;
        });
      }

      it("opens on chip tap; Remove deletes the reference from the draft", async () => {
        const onSave = renderPanel(vi.fn(), 'prop("f-price")');

        const popup = await tapChip();
        fireEvent.click(within(popup).getByRole("button", { name: "Remove" }));

        // The whole canonical span is gone from the CM6 doc…
        await waitFor(() => {
          expect(document.querySelector(".cm-formula-chip")).toBeNull();
        });
        // …and from the DRAFT: the emptied (blank, hence saveable) text is
        // what Save hands up.
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSave).toHaveBeenCalledWith("");
      });

      it("Change property swaps the canonical reference in place", async () => {
        const onSave = renderPanel(vi.fn(), 'prop("f-price") * 2');

        const popup = await tapChip();
        fireEvent.click(
          within(popup).getByRole("button", { name: "Change property" })
        );
        // The property list is scoped to the popup — the reference list
        // outside also carries a "Unit Count" row.
        fireEvent.click(
          within(popup).getByRole("button", { name: "Unit Count" })
        );

        await waitFor(() => {
          expect(document.querySelector(".cm-formula-chip")?.textContent).toBe(
            "Unit Count"
          );
        });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSave).toHaveBeenCalledWith('prop("f-qty") * 2');
      });

      it("Change database swaps a db reference in place", async () => {
        const onSave = renderPanelWithDatabases(
          vi.fn(),
          'db("db-tasks").length()'
        );

        const popup = await tapChip();
        // A db chip's menu offers the database action, not the property one.
        expect(
          within(popup).queryByRole("button", { name: "Change property" })
        ).toBeNull();
        fireEvent.click(
          within(popup).getByRole("button", { name: "Change database" })
        );
        fireEvent.click(
          within(popup).getByRole("button", { name: "Projects" })
        );

        await waitFor(() => {
          expect(document.querySelector(".cm-formula-chip")?.textContent).toBe(
            "Projects"
          );
        });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSave).toHaveBeenCalledWith('db("db-projects").length()');
      });

      it("Remove deletes a db reference's whole canonical span", async () => {
        const onSave = renderPanelWithDatabases(vi.fn(), 'db("db-tasks")');

        const popup = await tapChip();
        fireEvent.click(within(popup).getByRole("button", { name: "Remove" }));

        await waitFor(() => {
          expect(document.querySelector(".cm-formula-chip")).toBeNull();
        });
        // The emptied (blank, hence saveable) draft is what Save hands up.
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(onSave).toHaveBeenCalledWith("");
      });
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

  describe("sheet layout (mobile)", () => {
    beforeEach(() => {
      pointer.coarse = true;
      // Keep the CM6 mount suspended so the Suspense fallback textarea is
      // the stable editing surface (see the module mock above).
      cm6.suppressMount = true;
    });

    function renderSheet({ expression = "" } = {}) {
      const onCancel = vi.fn();
      const onSave = vi.fn();
      render(
        <FormulaEditorPanel
          expression={expression}
          fields={FIELDS}
          layout="sheet"
          onCancel={onCancel}
          onSave={onSave}
          previewRows={PREVIEW_ROWS}
        />
      );
      return { onCancel, onSave };
    }

    /**
     * While the CM6 boundary is pending (the suppressed mount above), React
     * defers committing sibling updates from discrete events to the retry
     * tick, so every interaction that asserts re-rendered state must flush a
     * frame first.
     */
    async function fire(...events: (() => void)[]): Promise<void> {
      for (const event of events) {
        event();
        await flushFrames();
      }
    }

    it("Cancel backs out without saving", async () => {
      const { onCancel, onSave } = renderSheet();
      await flushFrames();

      await fire(() => {
        fireEvent.change(screen.getByLabelText("Formula expression"), {
          target: { value: "1 + 2" },
        });
      });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
    });

    it("Done saves the canonical draft and is gated on parse errors", async () => {
      const { onSave } = renderSheet();
      await flushFrames();

      // Done is the sheet's only save affordance — no standalone Save.
      expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

      const textarea = screen.getByLabelText("Formula expression");
      await fire(() => {
        fireEvent.change(textarea, { target: { value: "thisPage.Price * 2" } });
      });
      const done = screen.getByRole("button", { name: "Done" });
      expect(done.hasAttribute("disabled")).toBe(false);
      fireEvent.click(done);
      expect(onSave).toHaveBeenCalledWith('prop("f-price") * 2');

      // Parse errors gate Done exactly like Save in the other layouts.
      await fire(() => {
        fireEvent.change(textarea, { target: { value: "1 +" } });
      });
      expect(done.hasAttribute("disabled")).toBe(true);
      fireEvent.click(done);
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("status pill toggles the expanded diagnostic message", async () => {
      renderSheet();
      await flushFrames();

      const textarea = screen.getByLabelText("Formula expression");
      await fire(() => {
        fireEvent.change(textarea, { target: { value: 'abs("oops")' } });
      });

      // Collapsed: just the issue count, no message.
      const pill = screen.getByRole("button", { name: "1 issue" });
      expect(screen.queryByText(ABS_DIAG_RE)).toBeNull();

      await fire(() => {
        fireEvent.click(pill);
      });
      expect(screen.getByText(ABS_DIAG_RE)).toBeDefined();
      await fire(() => {
        fireEvent.click(pill);
      });
      expect(screen.queryByText(ABS_DIAG_RE)).toBeNull();

      // Clean drafts relabel the pill with the checked result type.
      await fire(() => {
        fireEvent.change(textarea, { target: { value: "1 + 2" } });
      });
      expect(screen.getByRole("button", { name: "✓ number" })).toBeDefined();
    });

    it("property picker searches and inserts through the property path", async () => {
      renderSheet();
      await flushFrames();

      await fire(() => {
        fireEvent.click(
          screen.getByRole("button", { name: "Insert property" })
        );
      });
      const search = screen.getByLabelText("Search properties");
      await fire(() => {
        fireEvent.change(search, { target: { value: "pri" } });
      });
      expect(screen.queryByText("Unit Count")).toBeNull();

      await fire(() => {
        fireEvent.click(screen.getByText("Price"));
      });
      const textarea = screen.getByLabelText(
        "Formula expression"
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe("thisPage.Price");
    });

    it("accessory operator keys insert their token at the caret", async () => {
      renderSheet();
      await flushFrames();

      const textarea = screen.getByLabelText(
        "Formula expression"
      ) as HTMLTextAreaElement;
      await fire(
        () => {
          fireEvent.change(textarea, { target: { value: "1 " } });
        },
        () => {
          fireEvent.click(screen.getByRole("button", { name: "Insert ==" }));
        }
      );
      expect(textarea.value).toBe("1 ==");
    });

    it("renders no inline reference browser in the sheet", async () => {
      renderSheet();
      await flushFrames();

      expect(
        screen.queryByLabelText("Search properties, functions, and operators")
      ).toBeNull();
      // The accessory row stands in for it.
      expect(screen.getByRole("toolbar")).toBeDefined();
    });
  });

  describe("chip option menu (drawer presentation)", () => {
    // The sheet tests keep the CM6 mount suspended (see the module mock), so
    // chips never render on the fallback textarea and there's nothing to tap
    // through the panel. The coarse-pointer drawer presentation is covered by
    // rendering the menu component directly instead.
    beforeEach(() => {
      pointer.coarse = true;
    });

    function renderMenu(
      tap: Partial<
        NonNullable<Parameters<typeof FormulaChipMenu>[0]["tap"]>
      > = {}
    ) {
      const onClose = vi.fn();
      const onPickDatabase = vi.fn();
      const onPickProperty = vi.fn();
      const onRemove = vi.fn();
      render(
        <FormulaChipMenu
          databases={RELATED_DATABASES}
          fields={FIELDS}
          onClose={onClose}
          onPickDatabase={onPickDatabase}
          onPickProperty={onPickProperty}
          onRemove={onRemove}
          tap={{
            anchor: document.createElement("span"),
            from: 0,
            kind: "property",
            refId: "f-price",
            to: 'prop("f-price")'.length,
            ...tap,
          }}
        />
      );
      return { onClose, onPickDatabase, onPickProperty, onRemove };
    }

    it("presents the options as a bottom drawer and routes Remove", async () => {
      const { onRemove } = renderMenu();

      // Coarse pointers get the vaul drawer, not an anchored popover.
      const drawer = await waitFor(() => {
        const element = document.querySelector("[data-slot='drawer-content']");
        expect(element).not.toBeNull();
        return element as HTMLElement;
      });
      expect(
        document.querySelector("[data-slot='popover-content']")
      ).toBeNull();

      fireEvent.click(within(drawer).getByRole("button", { name: "Remove" }));
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it("walks Change property to the schema list and reports the pick", async () => {
      const { onPickProperty } = renderMenu();

      const drawer = await waitFor(() => {
        const element = document.querySelector("[data-slot='drawer-content']");
        expect(element).not.toBeNull();
        return element as HTMLElement;
      });
      fireEvent.click(
        within(drawer).getByRole("button", { name: "Change property" })
      );
      fireEvent.click(
        within(drawer).getByRole("button", { name: "Unit Count" })
      );
      expect(onPickProperty).toHaveBeenCalledTimes(1);
      expect(onPickProperty.mock.calls[0]?.[0]).toMatchObject({
        id: "f-qty",
        name: "Unit Count",
      });
    });

    it("offers Change database for db-chip taps and reports the pick", async () => {
      const { onPickDatabase, onPickProperty } = renderMenu({
        kind: "database",
        refId: "db-tasks",
        to: 'db("db-tasks")'.length,
      });

      const drawer = await waitFor(() => {
        const element = document.querySelector("[data-slot='drawer-content']");
        expect(element).not.toBeNull();
        return element as HTMLElement;
      });
      // A db chip's menu swaps databases, not properties.
      expect(
        within(drawer).queryByRole("button", { name: "Change property" })
      ).toBeNull();
      fireEvent.click(
        within(drawer).getByRole("button", { name: "Change database" })
      );
      fireEvent.click(within(drawer).getByRole("button", { name: "Projects" }));
      expect(onPickDatabase).toHaveBeenCalledTimes(1);
      expect(onPickDatabase.mock.calls[0]?.[0]).toMatchObject({
        id: "db-projects",
        name: "Projects",
      });
      expect(onPickProperty).not.toHaveBeenCalled();
    });
  });
});
