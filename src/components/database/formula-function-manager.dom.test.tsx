/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormulaFunctionManagerDialog } from "@/components/database/formula-function-manager.tsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx";
import type { LocalFormulaFunction } from "@/lib/schemas/local-formula-function.ts";

// Map-backed stand-in for the localStorage collection (the ops-test pattern)
// plus a change feed, so the mocked live hooks below re-render the manager
// when an op writes — the create/edit/delete flows assert exactly that.
const store = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const map = new Map<string, LocalFormulaFunction>();
  const state = { snapshot: [] as LocalFormulaFunction[] };
  const notify = () => {
    state.snapshot = [...map.values()];
    for (const listener of listeners) {
      listener();
    }
  };
  return { listeners, map, notify, state };
});

vi.mock("@/db/collections/local-collections.ts", () => ({
  localFormulaFunctionsCollection: {
    delete: (id: string) => {
      store.map.delete(id);
      store.notify();
    },
    get: (id: string) => store.map.get(id),
    has: (id: string) => store.map.has(id),
    insert: (fn: LocalFormulaFunction) => {
      store.map.set(fn.id, fn);
      store.notify();
    },
    get toArray() {
      return [...store.map.values()];
    },
    update: (id: string, recipe: (draft: LocalFormulaFunction) => void) => {
      const existing = store.map.get(id);
      if (existing !== undefined) {
        const draft = structuredClone(existing);
        recipe(draft);
        store.map.set(id, draft);
        store.notify();
      }
    },
  },
}));

// Live hooks re-implemented over the Map store (useLiveQuery needs the real
// TanStack DB collection, which the mock above replaces).
vi.mock("@/db/queries/use-formula-functions.ts", async () => {
  const react = await import("react");
  const { prepareUserFunctions } = await import(
    "@/lib/formula/user-functions.ts"
  );
  const subscribe = (listener: () => void) => {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  };
  const useFormulaFunctionDefs = () =>
    react.useSyncExternalStore(subscribe, () => store.state.snapshot);
  return {
    useFormulaFunctionDefs,
    useFormulaUserFunctions: () => {
      const defs = useFormulaFunctionDefs();
      return react.useMemo(() => prepareUserFunctions(defs), [defs]);
    },
  };
});

// The manager only needs the workspace databases for db("…") chips in the
// body editor; none are needed for these flows.
vi.mock("@/db/queries/use-database.ts", () => ({
  useAllDatabases: () => [],
}));

// Keep the lazy CM6 chunk suspended forever so the Suspense fallback
// textarea is the manager form's editing surface DETERMINISTICALLY (the
// formula-editor-panel dom test's pattern).
vi.mock("@/components/database/formula-code-editor.tsx", async () => {
  const react = await import("react");
  const pending = new Promise<never>(() => undefined);
  return {
    FormulaCodeEditor: () => {
      react.use(pending);
      return null;
    },
  };
});

const NO_FUNCTIONS_RE = /No custom functions yet/;
const PARSE_ERROR_RE = /Unexpected end of expression/;

/** Seed one stored definition directly (bypassing the ops, like a reload). */
function seedDef(
  partial: Pick<LocalFormulaFunction, "expression" | "name" | "params"> &
    Partial<LocalFormulaFunction>
): LocalFormulaFunction {
  const timestamp = new Date().toISOString();
  const fn: LocalFormulaFunction = {
    createdAt: timestamp,
    id: `fn-${partial.name}`,
    updatedAt: timestamp,
    ...partial,
  };
  store.map.set(fn.id, fn);
  store.notify();
  return fn;
}

/** Flush the rAF-based focus passes (stubbed to timeouts) and retry ticks. */
function flushFrames(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * While the suspended CM6 boundary is pending, React defers committing
 * sibling updates from discrete events to the retry tick — flush after
 * every event that asserts re-rendered state (the sheet-layout test's rule).
 */
async function fire(...events: (() => void)[]): Promise<void> {
  for (const event of events) {
    event();
    await flushFrames();
  }
}

beforeEach(() => {
  store.map.clear();
  store.state.snapshot = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0) as unknown as number
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    clearTimeout(id);
  });
  // Base UI's dialog machinery observes size and animation state; jsdom
  // lacks both (same stubs as the relation cell editor / chip menu tests).
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
  Element.prototype.getAnimations = () => [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderManager() {
  const onOpenChange = vi.fn();
  render(<FormulaFunctionManagerDialog onOpenChange={onOpenChange} open />);
  return onOpenChange;
}

describe("FormulaFunctionManagerDialog", () => {
  it("lists definitions with signatures and descriptions", async () => {
    seedDef({
      description: "Score with a weighting factor.",
      expression: "points * weight",
      name: "weightedScore",
      params: ["points", "weight"],
    });
    seedDef({ expression: "x * 1.1", name: "bump", params: ["x"] });
    renderManager();
    await flushFrames();

    expect(screen.getByText("Custom functions")).toBeDefined();
    // Name-sorted, signature-rendered rows with the description beneath.
    expect(screen.getByText("bump(x)")).toBeDefined();
    expect(screen.getByText("weightedScore(points, weight)")).toBeDefined();
    expect(screen.getByText("Score with a weighting factor.")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Edit weightedScore" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Delete weightedScore" })
    ).toBeDefined();
  });

  it("creates a definition through the ops and updates the list", async () => {
    renderManager();
    await flushFrames();

    // Empty state, then the form.
    expect(screen.getByText(NO_FUNCTIONS_RE)).toBeDefined();
    await fire(() => {
      fireEvent.click(screen.getByRole("button", { name: "New function" }));
    });

    const nameInput = screen.getByLabelText("Name");
    const save = screen.getByRole("button", { name: "Save" });

    // A catalog collision surfaces the ops-layer message inline and keeps
    // Save disabled (the UI never reimplements the rule — same string).
    await fire(() => {
      fireEvent.change(nameInput, { target: { value: "round" } });
    });
    expect(
      screen.getByText('"round" is already a built-in function')
    ).toBeDefined();
    expect(save.hasAttribute("disabled")).toBe(true);

    // Valid input saves through createFormulaFunction and lands back on the
    // list, which now shows the new definition.
    await fire(
      () => {
        fireEvent.change(nameInput, { target: { value: "bump" } });
      },
      () => {
        fireEvent.change(screen.getByLabelText("Parameters"), {
          target: { value: "x" },
        });
      },
      () => {
        fireEvent.change(screen.getByLabelText("Function expression"), {
          target: { value: "x * 1.1" },
        });
      }
    );
    expect(save.hasAttribute("disabled")).toBe(false);
    await fire(() => {
      fireEvent.click(save);
    });

    expect(screen.getByText("bump(x)")).toBeDefined();
    expect([...store.map.values()][0]).toMatchObject({
      expression: "x * 1.1",
      name: "bump",
      params: ["x"],
    });
  });

  it("renames a definition through the edit flow", async () => {
    const def = seedDef({ expression: "x * 1.1", name: "bump", params: ["x"] });
    renderManager();
    await flushFrames();

    await fire(() => {
      fireEvent.click(screen.getByRole("button", { name: "Edit bump" }));
    });
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    expect(nameInput.value).toBe("bump");
    expect(
      (screen.getByLabelText("Function expression") as HTMLTextAreaElement)
        .value
    ).toBe("x * 1.1");

    await fire(
      () => {
        fireEvent.change(nameInput, { target: { value: "boost" } });
      },
      () => {
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
      }
    );

    expect(screen.getByText("boost(x)")).toBeDefined();
    expect(screen.queryByText("bump(x)")).toBeNull();
    expect(store.map.get(def.id)?.name).toBe("boost");
  });

  it("deletes only after the two-step confirm", async () => {
    const def = seedDef({ expression: "x * 1.1", name: "bump", params: ["x"] });
    renderManager();
    await flushFrames();

    // First press arms the row — nothing is deleted yet.
    await fire(() => {
      fireEvent.click(screen.getByRole("button", { name: "Delete bump" }));
    });
    expect(screen.getByText("bump(x)")).toBeDefined();
    expect(store.map.has(def.id)).toBe(true);

    // Second press deletes; the row disappears into the empty state.
    await fire(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm delete bump" })
      );
    });
    expect(screen.queryByText("bump(x)")).toBeNull();
    expect(screen.getByText(NO_FUNCTIONS_RE)).toBeDefined();
    expect(store.map.has(def.id)).toBe(false);
  });

  it("disables Save on expression parse errors and blank bodies", async () => {
    renderManager();
    await flushFrames();
    await fire(() => {
      fireEvent.click(screen.getByRole("button", { name: "New function" }));
    });

    await fire(() => {
      fireEvent.change(screen.getByLabelText("Name"), {
        target: { value: "bump" },
      });
    });
    const save = screen.getByRole("button", { name: "Save" });
    // A blank body is unsaveable (unlike a column formula, clearing has no
    // meaning here — Delete covers removal).
    expect(save.hasAttribute("disabled")).toBe(true);

    const expression = screen.getByLabelText("Function expression");
    await fire(() => {
      fireEvent.change(expression, { target: { value: "1 +" } });
    });
    expect(screen.getByText(PARSE_ERROR_RE)).toBeDefined();
    expect(save.hasAttribute("disabled")).toBe(true);

    await fire(() => {
      fireEvent.change(expression, { target: { value: "1 + 2" } });
    });
    expect(screen.getByText("✓ Valid")).toBeDefined();
    expect(save.hasAttribute("disabled")).toBe(false);
  });

  it("Escape closes only the manager when nested inside another dialog", async () => {
    const outerChange = vi.fn();
    const managerChange = vi.fn();
    render(
      <Dialog onOpenChange={outerChange} open>
        <DialogContent>
          <DialogTitle>Formula</DialogTitle>
          <FormulaFunctionManagerDialog onOpenChange={managerChange} open />
        </DialogContent>
      </Dialog>
    );
    await flushFrames();

    fireEvent.keyDown(document.body, { key: "Escape" });
    await flushFrames();

    expect(managerChange).toHaveBeenCalled();
    expect(managerChange.mock.calls[0]?.[0]).toBe(false);
    expect(outerChange).not.toHaveBeenCalled();
  });
});
