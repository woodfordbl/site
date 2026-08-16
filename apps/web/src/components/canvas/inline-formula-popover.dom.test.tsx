/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasEditorActions } from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { InlineFormulaPopover } from "@/components/canvas/inline-formula-popover.tsx";

/**
 * Dismissal, which is the whole of this component that is not positioning:
 * a click inside the panel — including inside the surfaces it PORTALS out of
 * itself — must not close it, and a click on the page behind must.
 *
 * The panel stands in for the real one (CM6, a reference browser, a live
 * preview — none of it what these cases are about) as the two things
 * dismissal has to reason about: a control inside the panel, and a portaled
 * menu at the document root.
 */
vi.mock("@/components/database/formula-editor-panel.tsx", async () => {
  const react = await import("react");
  const dom = await import("react-dom");
  function StubPanel() {
    return react.createElement(
      "div",
      null,
      react.createElement("button", { type: "button" }, "inside the panel"),
      dom.createPortal(
        react.createElement(
          "div",
          { className: "overlay-popover-surface" },
          react.createElement("button", { type: "button" }, "Change property")
        ),
        document.body
      )
    );
  }
  return { FormulaEditorPanel: StubPanel };
});

// Collection-backed hooks and the relation resolver: neither has anything to
// say about dismissal, and both reach for browser-only local collections.
vi.mock("@/db/queries/use-database.ts", () => ({ useAllDatabases: () => [] }));
vi.mock("@/db/queries/use-formula-functions.ts", () => ({
  useFormulaUserFunctions: () => [],
}));
vi.mock("@/lib/databases/formula-relations.ts", () => ({
  localFormulaRelationResolver: () => ({}),
}));

const canvas = {
  dispatch: vi.fn(),
  getRows: () => [],
} as unknown as CanvasEditorActions;

/** A canvas row whose field holds one formula token, plus a plain paragraph. */
function renderCanvas() {
  const view = render(
    <CanvasEditorContext.Provider value={canvas}>
      <div data-canvas-row-id="row-1">
        <div data-rich-text-field>
          {"total: "}
          <span data-expression='prop("f-price")' data-formula-token>
            10
          </span>
        </div>
      </div>
      <p>behind the panel</p>
      <InlineFormulaPopover />
    </CanvasEditorContext.Provider>
  );
  return view;
}

function panel() {
  return document.querySelector("[data-inline-formula-popover]");
}

/** Click the token — the panel's only opening gesture. */
function openPanel() {
  fireEvent.click(document.querySelector("[data-formula-token]") as Element);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InlineFormulaPopover", () => {
  it("opens on a token click and closes on a click behind it", () => {
    renderCanvas();
    openPanel();
    expect(panel()).not.toBeNull();

    fireEvent.click(screen.getByText("behind the panel"));
    expect(panel()).toBeNull();
  });

  it("stays open when a click lands on its own controls", () => {
    renderCanvas();
    openPanel();
    expect(panel()).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "inside the panel" }));
    expect(panel()).not.toBeNull();
  });

  it("stays open when a portaled menu row unmounts itself on the click that picked it", () => {
    renderCanvas();
    openPanel();
    expect(panel()).not.toBeNull();

    // A chip-menu row swaps itself for the property list the instant it is
    // picked: React flushes the discrete click synchronously from its own
    // listener — on the portal container, so BELOW the document — and the row
    // is detached by the time the click bubbles the rest of the way up. That
    // ordering is the bug, so the listener here stands in for React's, and
    // the removal happens mid-dispatch exactly as it does in the browser.
    // Asked at click time, `closest` walks a detached stump that no longer
    // reaches the panel's surface, and the click reads as one outside it.
    const row = screen.getByRole("button", { name: "Change property" });
    document.body.addEventListener("click", () => row.remove(), { once: true });
    fireEvent.pointerDown(row);
    fireEvent.click(row);
    expect(row.isConnected).toBe(false);

    expect(panel()).not.toBeNull();
  });

  it("does not let a press inside excuse the next keyboard-activated click", () => {
    renderCanvas();
    openPanel();
    expect(panel()).not.toBeNull();

    const inside = screen.getByRole("button", { name: "inside the panel" });
    fireEvent.pointerDown(inside);
    fireEvent.click(inside);
    expect(panel()).not.toBeNull();

    // No press of its own (Enter on a focused control, or a programmatic
    // click) — the verdict from the last press must not carry over.
    fireEvent.click(screen.getByText("behind the panel"));
    expect(panel()).toBeNull();
  });
});
