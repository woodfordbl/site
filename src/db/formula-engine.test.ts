/** @vitest-environment jsdom */
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
  EMPTY_FORMULA_OVERLAY,
  formulaOverlaySnapshot,
  observeFormulaEvaluationsForTests,
  resetFormulaEngineForTests,
  subscribeFormulaEngine,
} from "@/db/formula-engine.ts";
import { localFormulaRelationResolver } from "@/lib/databases/formula-relations.ts";
import { computeFormulaOverlay } from "@/lib/databases/formula-values.ts";

vi.mock(
  "@/db/collections/local-collections.ts",
  () => import("@/db/formula-engine.fixture.ts")
);

const TASK_FIELDS = [
  textField("t-title", "Title"),
  numberField("t-est", "Estimate"),
  formulaField("t-double", "Double", 'prop("t-est") * 2'),
];

const PROJECT_FIELDS = [
  textField("p-name", "Name"),
  relationField("p-rel", "Tasks", "tasks"),
  formulaField("p-rollup", "Rollup", 'prop("p-rel").map(r => r.Double).sum()'),
];

/** Tasks (Estimate + Double) ← Projects (relation + rollup over Double). */
function seedWorkspace(): void {
  fixture.seed(
    [
      databaseOf("tasks", "Tasks", TASK_FIELDS, "t-title"),
      databaseOf("projects", "Projects", PROJECT_FIELDS, "p-name"),
    ],
    [
      rowOf("tasks", "task-1", { "t-est": 3, "t-title": "One" }),
      rowOf("tasks", "task-2", { "t-est": 5, "t-title": "Two" }),
      rowOf("projects", "proj-1", {
        "p-name": "Alpha",
        "p-rel": ["task-1", "task-2"],
      }),
    ]
  );
}

/** Wait out the engine's queued-microtask flush. */
function flushEngine(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(() => queueMicrotask(() => resolve()));
  });
}

function rollupValue(): unknown {
  return formulaOverlaySnapshot("projects").get("proj-1")?.["p-rollup"]
    ?.cellValue;
}

afterEach(() => {
  resetFormulaEngineForTests();
  fixture.reset();
  vi.useRealTimers();
});

describe("formula engine — warm pass", () => {
  it("computes every formula cell synchronously on first subscribe", () => {
    seedWorkspace();
    const stop = subscribeFormulaEngine("projects", vi.fn());

    expect(formulaOverlaySnapshot("tasks").get("task-1")?.["t-double"]).toEqual(
      { cellValue: 6, display: "6", isError: false }
    );
    expect(formulaOverlaySnapshot("tasks").get("task-2")?.["t-double"]).toEqual(
      { cellValue: 10, display: "10", isError: false }
    );
    // Rollup reads the tasks' Double values from the engine cache.
    expect(rollupValue()).toBe(16);
    stop();
  });

  it("matches the pure overlay path byte-for-byte (parity)", () => {
    seedWorkspace();
    const stop = subscribeFormulaEngine("projects", vi.fn());

    // Same inputs, both paths: the engine's warm cache vs the one-shot pure
    // overlay reading the (mocked) collections through the P3.2 resolver.
    const pureTasks = computeFormulaOverlay(
      TASK_FIELDS,
      [fixture.row("task-1"), fixture.row("task-2")],
      { relations: localFormulaRelationResolver() }
    );
    const pureProjects = computeFormulaOverlay(
      PROJECT_FIELDS,
      [fixture.row("proj-1")],
      { relations: localFormulaRelationResolver() }
    );

    expect(formulaOverlaySnapshot("tasks")).toEqual(pureTasks);
    expect(formulaOverlaySnapshot("projects")).toEqual(pureProjects);
    stop();
  });
});

describe("formula engine — incremental updates", () => {
  it("data edit re-evaluates precisely and notifies only affected databases", async () => {
    seedWorkspace();
    const onTasks = vi.fn();
    const onProjects = vi.fn();
    const stops = [
      subscribeFormulaEngine("tasks", onTasks),
      subscribeFormulaEngine("projects", onProjects),
    ];
    const evaluations: string[] = [];
    observeFormulaEvaluationsForTests((databaseId, fieldId, rowId) => {
      evaluations.push(`${databaseId}:${fieldId}:${rowId}`);
    });

    // A non-referenced field: no evaluation, no notification, stable refs.
    const tasksBefore = formulaOverlaySnapshot("tasks");
    const projectsBefore = formulaOverlaySnapshot("projects");
    fixture.updateRowValues("proj-1", { "p-name": "Renamed" });
    await flushEngine();
    expect(evaluations).toEqual([]);
    expect(onTasks).not.toHaveBeenCalled();
    expect(onProjects).not.toHaveBeenCalled();
    expect(formulaOverlaySnapshot("projects")).toBe(projectsBefore);

    // Estimate edit: exactly Double(task-1) and the referrer rollup — the
    // rollup's other member reads come straight from the cache.
    fixture.updateRowValues("task-1", { "t-est": 4 });
    await flushEngine();
    expect(evaluations).toEqual([
      "tasks:t-double:task-1",
      "projects:p-rollup:proj-1",
    ]);
    expect(onTasks).toHaveBeenCalledTimes(1);
    expect(onProjects).toHaveBeenCalledTimes(1);
    expect(
      formulaOverlaySnapshot("tasks").get("task-1")?.["t-double"]?.cellValue
    ).toBe(8);
    expect(rollupValue()).toBe(18);
    expect(formulaOverlaySnapshot("tasks")).not.toBe(tasksBefore);
    for (const stop of stops) {
      stop();
    }
  });

  it("cross-database edits reach referrer rollups (the reactive case)", async () => {
    seedWorkspace();
    const onProjects = vi.fn();
    const stop = subscribeFormulaEngine("projects", onProjects);
    expect(rollupValue()).toBe(16);

    // Edit a TARGET row only — the old per-view overlay never saw this.
    fixture.updateRowValues("task-2", { "t-est": 50 });
    await flushEngine();
    expect(onProjects).toHaveBeenCalledTimes(1);
    expect(rollupValue()).toBe(106);
    stop();
  });

  it("relation cell edits re-map referrers through the reverse index", async () => {
    seedWorkspace();
    const stop = subscribeFormulaEngine("projects", vi.fn());
    expect(rollupValue()).toBe(16);

    fixture.updateRowValues("proj-1", { "p-rel": ["task-1"] });
    await flushEngine();
    expect(rollupValue()).toBe(6);

    // The unlinked task no longer dirties the rollup.
    const before = formulaOverlaySnapshot("projects");
    fixture.updateRowValues("task-2", { "t-est": 100 });
    await flushEngine();
    expect(formulaOverlaySnapshot("projects")).toBe(before);
    stop();
  });

  it("row add heals stale refs; row remove evicts and updates referrers", async () => {
    fixture.seed(
      [
        databaseOf("tasks", "Tasks", TASK_FIELDS, "t-title"),
        databaseOf("projects", "Projects", PROJECT_FIELDS, "p-name"),
      ],
      [
        rowOf("tasks", "task-1", { "t-est": 3 }),
        // task-3 doesn't exist yet — its stored ref skips (stale-id rule).
        rowOf("projects", "proj-1", { "p-rel": ["task-1", "task-3"] }),
      ]
    );
    const stop = subscribeFormulaEngine("projects", vi.fn());
    expect(rollupValue()).toBe(6);

    fixture.insertRow(rowOf("tasks", "task-3", { "t-est": 7 }));
    await flushEngine();
    expect(
      formulaOverlaySnapshot("tasks").get("task-3")?.["t-double"]?.cellValue
    ).toBe(14);
    expect(rollupValue()).toBe(20);

    fixture.removeRow("task-1");
    await flushEngine();
    expect(formulaOverlaySnapshot("tasks").has("task-1")).toBe(false);
    expect(rollupValue()).toBe(14);
    stop();
  });

  it("schema changes rebuild the graph and recompute dependents", async () => {
    seedWorkspace();
    const stop = subscribeFormulaEngine("projects", vi.fn());
    expect(rollupValue()).toBe(16);

    fixture.updateDatabase(
      databaseOf(
        "tasks",
        "Tasks",
        [
          textField("t-title", "Title"),
          numberField("t-est", "Estimate"),
          formulaField("t-double", "Double", 'prop("t-est") * 3'),
        ],
        "t-title"
      )
    );
    await flushEngine();
    expect(
      formulaOverlaySnapshot("tasks").get("task-1")?.["t-double"]?.cellValue
    ).toBe(9);
    expect(rollupValue()).toBe(24);
    stop();
  });

  it("removing a formula field prunes its cached cells from the overlay", async () => {
    seedWorkspace();
    const stop = subscribeFormulaEngine("tasks", vi.fn());
    expect(formulaOverlaySnapshot("tasks").size).toBe(2);

    fixture.updateDatabase(
      databaseOf(
        "tasks",
        "Tasks",
        [textField("t-title", "Title"), numberField("t-est", "Estimate")],
        "t-title"
      )
    );
    await flushEngine();
    // No formula columns left: the stable empty overlay, no ghost cells.
    expect(formulaOverlaySnapshot("tasks")).toBe(EMPTY_FORMULA_OVERLAY);
    stop();
  });
});

describe("formula engine — db() whole-database references", () => {
  const DASH_FIELDS = [
    textField("d-name", "Name"),
    formulaField("d-total", "Total", 'db("tasks").map(r => r.Double).sum()'),
  ];

  /** Tasks (Estimate + Double) ← Dash (db("tasks") rollup, no relation). */
  function seedDbRefWorkspace(): void {
    fixture.seed(
      [
        databaseOf("tasks", "Tasks", TASK_FIELDS, "t-title"),
        databaseOf("dash", "Dash", DASH_FIELDS, "d-name"),
      ],
      [
        rowOf("tasks", "task-1", { "t-est": 3 }),
        rowOf("tasks", "task-2", { "t-est": 5 }),
        rowOf("dash", "dash-1", {}),
      ]
    );
  }

  function totalValue(): unknown {
    return formulaOverlaySnapshot("dash").get("dash-1")?.["d-total"]?.cellValue;
  }

  it("computes the whole-database rollup in the warm pass", () => {
    seedDbRefWorkspace();
    const stop = subscribeFormulaEngine("dash", vi.fn());
    // Every Tasks row, no relation links anywhere: 3*2 + 5*2.
    expect(totalValue()).toBe(16);
    stop();
  });

  it("recomputes when ANY target row's value changes", async () => {
    seedDbRefWorkspace();
    const onDash = vi.fn();
    const stop = subscribeFormulaEngine("dash", onDash);
    expect(totalValue()).toBe(16);

    fixture.updateRowValues("task-2", { "t-est": 50 });
    await flushEngine();
    expect(onDash).toHaveBeenCalledTimes(1);
    expect(totalValue()).toBe(106);
    stop();
  });

  it("recomputes on target row insert AND delete, evicting deleted cells", async () => {
    seedDbRefWorkspace();
    const stop = subscribeFormulaEngine("dash", vi.fn());
    expect(totalValue()).toBe(16);

    fixture.insertRow(rowOf("tasks", "task-3", { "t-est": 7 }));
    await flushEngine();
    expect(totalValue()).toBe(30);

    fixture.removeRow("task-1");
    await flushEngine();
    // The deleted row's cached formula cells are evicted, not just stale.
    expect(formulaOverlaySnapshot("tasks").has("task-1")).toBe(false);
    expect(totalValue()).toBe(24);
    stop();
  });

  it("ignores target edits to fields the db() member does not read", async () => {
    seedDbRefWorkspace();
    const stop = subscribeFormulaEngine("dash", vi.fn());
    const before = formulaOverlaySnapshot("dash");

    fixture.updateRowValues("task-1", { "t-title": "Renamed" });
    await flushEngine();
    // t-title feeds neither Double nor the db() member — stable snapshot.
    expect(formulaOverlaySnapshot("dash")).toBe(before);
    stop();
  });
});

describe("formula engine — volatile clock", () => {
  it("re-evaluates volatile columns every minute while subscribed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T10:00:00.000Z"));
    fixture.seed(
      [
        databaseOf(
          "clocked",
          "Clocked",
          [
            textField("c-title", "Title"),
            formulaField("c-now", "Now", "now()"),
          ],
          "c-title"
        ),
      ],
      [rowOf("clocked", "row-1", {})]
    );
    const onChange = vi.fn();
    const stop = subscribeFormulaEngine("clocked", onChange);
    const before = formulaOverlaySnapshot("clocked").get("row-1")?.["c-now"];
    expect(before?.display).not.toBe("");

    vi.advanceTimersByTime(60_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    const after = formulaOverlaySnapshot("clocked").get("row-1")?.["c-now"];
    expect(after?.display).not.toBe(before?.display);

    // Last unsubscriber stops the tick entirely.
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("skips ticking schemas with no volatile columns", () => {
    vi.useFakeTimers();
    seedWorkspace();
    const onChange = vi.fn();
    const stop = subscribeFormulaEngine("tasks", onChange);

    vi.advanceTimersByTime(180_000);
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });
});
