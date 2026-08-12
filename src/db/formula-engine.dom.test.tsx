/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  databaseOf,
  formulaEngineFixture as fixture,
  formulaField,
  numberField,
  relationField,
  rowOf,
  textField,
} from "@/db/formula-engine.fixture.ts";
import {
  resetFormulaEngineForTests,
  useFormulaOverlay,
} from "@/db/formula-engine.ts";

vi.mock(
  "@/db/collections/local-collections.ts",
  () => import("@/db/formula-engine.fixture.ts")
);

/**
 * The view-integration slice in miniature: a component reads one cell's
 * display through `useFormulaOverlay` (exactly how the table view and the
 * row properties panel consume the engine) and must re-render when the
 * engine pushes a new snapshot — including for a cross-database edit.
 */
function FormulaCell({
  databaseId,
  fieldId,
  rowId,
}: {
  databaseId: string;
  fieldId: string;
  rowId: string;
}): ReactNode {
  const overlay = useFormulaOverlay(databaseId);
  return <output>{overlay.get(rowId)?.[fieldId]?.display ?? ""}</output>;
}

afterEach(() => {
  cleanup();
  resetFormulaEngineForTests();
  fixture.reset();
});

describe("useFormulaOverlay", () => {
  it("serves engine values and re-renders on cross-database edits", async () => {
    fixture.seed(
      [
        databaseOf(
          "tasks",
          "Tasks",
          [textField("t-title", "Title"), numberField("t-est", "Estimate")],
          "t-title"
        ),
        databaseOf(
          "projects",
          "Projects",
          [
            textField("p-name", "Name"),
            relationField("p-rel", "Tasks", "tasks"),
            formulaField(
              "p-rollup",
              "Rollup",
              'prop("p-rel").map(r => r.Estimate).sum()'
            ),
          ],
          "p-name"
        ),
      ],
      [
        rowOf("tasks", "task-1", { "t-est": 3 }),
        rowOf("projects", "proj-1", { "p-rel": ["task-1"] }),
      ]
    );

    render(
      <FormulaCell databaseId="projects" fieldId="p-rollup" rowId="proj-1" />
    );
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("3");
    });

    // Edit the TARGET database only; the referrer's rendered rollup follows.
    await act(async () => {
      fixture.updateRowValues("task-1", { "t-est": 9 });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("9");
    });
  });
});
