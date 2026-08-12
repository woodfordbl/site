/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseAdvancedFilterChip } from "@/components/database/database-advanced-filter-chip.tsx";
import type { FormulaRelatedDatabase } from "@/lib/databases/formula-values.ts";
import type { DatabaseView } from "@/lib/schemas/database.ts";

// Fine pointer keeps the ui Popover a plain popover (no vaul drawer/
// matchMedia scaffolding in jsdom). Stubbed so no DeviceLayoutProvider is
// needed.
vi.mock("@/hooks/device-layout.ts", () => ({
  useIsCoarsePrimaryPointer: () => false,
}));

// Keep the lazy CM6 editor suspended forever so the Suspense fallback
// TEXTAREA stays the editing surface deterministically (the panel dom tests'
// pattern — otherwise the chunk resolves mid-test and swaps surfaces under
// the assertions).
vi.mock("@/components/database/formula-code-editor.tsx", async () => {
  const react = await import("react");
  const pending = new Promise<never>(() => undefined);
  function SuspendedFormulaCodeEditor(): never {
    react.use(pending);
    throw new Error("unreachable");
  }
  return { FormulaCodeEditor: SuspendedFormulaCodeEditor };
});

const NON_BOOLEAN_HINT = /only rows where it is exactly true stay visible/i;
const IGNORED_TITLE = /Advanced filter is ignored —/;
const BROKEN_TITLE = /Advanced filter is broken —/;
const DELETED_FIELD_DIAGNOSTIC = /deleted or unknown field/i;

const FIELDS = [
  { id: "f-title", name: "Name", type: "text" },
  { id: "f-est", name: "Estimate", type: "number" },
] as const;

const RELATED_DATABASES: FormulaRelatedDatabase[] = [
  { id: "db-1", name: "Tasks", fields: [...FIELDS] },
];

function makeView(expression?: string): DatabaseView {
  return {
    id: "v-1",
    name: "All",
    type: "table",
    ...(expression === undefined ? {} : { advancedFilter: { expression } }),
    config: {},
  };
}

function renderChip(
  view: DatabaseView,
  {
    onChange = vi.fn(),
    showAddTrigger = true,
  }: {
    onChange?: (expression: string | undefined) => void;
    showAddTrigger?: boolean;
  } = {}
) {
  render(
    <DatabaseAdvancedFilterChip
      fields={[...FIELDS]}
      onAdvancedFilterChange={onChange}
      relatedDatabases={RELATED_DATABASES}
      showAddTrigger={showAddTrigger}
      userFunctions={new Map()}
      view={view}
    />
  );
}

afterEach(cleanup);

describe("DatabaseAdvancedFilterChip", () => {
  it("renders the dashed add trigger while unset, nothing without the gate", () => {
    renderChip(makeView());
    expect(screen.getByText("Advanced")).toBeDefined();
    cleanup();
    renderChip(makeView(), { showAddTrigger: false });
    expect(screen.queryByText("Advanced")).toBeNull();
  });

  it("applies a typed formula as canonical text through the change callback", () => {
    const onChange = vi.fn();
    renderChip(makeView(), { onChange });
    fireEvent.click(screen.getByText("Advanced"));
    const editor = screen.getByLabelText("Advanced filter formula");
    fireEvent.change(editor, {
      target: { value: "thisPage.Estimate > 3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith('prop("f-est") > 3');
  });

  it("blocks Apply on a parse error and on checker diagnostics", () => {
    renderChip(makeView());
    fireEvent.click(screen.getByText("Advanced"));
    const editor = screen.getByLabelText("Advanced filter formula");
    fireEvent.change(editor, { target: { value: "1 +" } });
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Apply" }).disabled
    ).toBe(true);
    fireEvent.change(editor, { target: { value: 'prop("f-gone") > 1' } });
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Apply" }).disabled
    ).toBe(true);
  });

  it("warns when the checked type is not boolean-compatible", () => {
    renderChip(makeView());
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Advanced filter formula"), {
      target: { value: "1 + 2" },
    });
    expect(screen.getByText(NON_BOOLEAN_HINT)).toBeDefined();
  });

  it("shows the set chip with the humanized expression, healthy styling", () => {
    renderChip(makeView('prop("f-est") > 3'));
    expect(screen.getByText("thisPage.Estimate > 3")).toBeDefined();
    const chip = screen.getByText("thisPage.Estimate > 3").closest("[title]");
    expect(chip).toBeNull();
  });

  it("marks an unparseable saved filter broken, titled as ignored", () => {
    renderChip(makeView("1 +"));
    const chip = document.querySelector("[title]");
    expect(chip?.getAttribute("title")).toMatch(IGNORED_TITLE);
  });

  it("marks a filter referencing a deleted field broken, titled by the diagnostic", () => {
    renderChip(makeView('prop("f-gone") > 1'));
    const chip = document.querySelector("[title]");
    expect(chip?.getAttribute("title")).toMatch(BROKEN_TITLE);
    expect(chip?.getAttribute("title")).toMatch(DELETED_FIELD_DIAGNOSTIC);
  });

  it("clears through the editor's Clear action", () => {
    const onChange = vi.fn();
    renderChip(makeView('prop("f-est") > 3'), { onChange });
    fireEvent.click(screen.getByText("thisPage.Estimate > 3"));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("clears through the chip's remove button", () => {
    const onChange = vi.fn();
    renderChip(makeView('prop("f-est") > 3'), { onChange });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove advanced filter" })
    );
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("auto-opens the editor for a just-added blank filter", () => {
    renderChip(makeView(""));
    expect(screen.getByLabelText("Advanced filter formula")).toBeDefined();
  });
});
