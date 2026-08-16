import { afterEach, describe, expect, it, vi } from "vitest";

import {
  databaseOf,
  formulaEngineFixture as fixture,
  formulaField,
  rowOf,
  textField,
} from "@/db/formula-engine.fixture.ts";
import {
  EMPTY_FORMULA_OVERLAY,
  formulaOverlaySnapshot,
  resetFormulaEngineForTests,
  subscribeFormulaEngine,
} from "@/db/formula-engine.ts";

vi.mock(
  "@/db/collections/local-collections.ts",
  () => import("@/db/formula-engine.fixture.ts")
);

/**
 * SSR safety: this file runs in the plain node environment (no `window`),
 * mirroring the server. The engine must never start there — no collection
 * subscriptions, no evaluation — and snapshots must be the shared empty
 * overlay so `useSyncExternalStore` server/client first renders agree.
 */

afterEach(() => {
  resetFormulaEngineForTests();
  fixture.reset();
});

describe("formula engine — server guard", () => {
  it("never starts without a window", () => {
    expect(typeof window).toBe("undefined");
    fixture.seed(
      [
        databaseOf(
          "db",
          "Db",
          [textField("f-t", "Title"), formulaField("f-x", "X", "1 + 1")],
          "f-t"
        ),
      ],
      [rowOf("db", "r1", {})]
    );

    const unsubscribe = subscribeFormulaEngine("db", () => undefined);

    // No engine: no collection subscriptions, and every snapshot — any
    // database id — is the one shared empty overlay (the server snapshot).
    expect(fixture.activeSubscriptionCount).toBe(0);
    expect(formulaOverlaySnapshot("db")).toBe(EMPTY_FORMULA_OVERLAY);
    expect(formulaOverlaySnapshot("other")).toBe(EMPTY_FORMULA_OVERLAY);
    expect(() => unsubscribe()).not.toThrow();
  });
});
