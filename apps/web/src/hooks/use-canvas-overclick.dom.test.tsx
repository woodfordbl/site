/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCanvasOverclick } from "@/hooks/use-canvas-overclick.ts";

/**
 * @fileoverview Guards the pointer contract between the page canvas and the
 * surfaces embedded in it.
 *
 * Overclick runs in the CAPTURE phase and, when it claims a press, calls
 * `preventDefault()` + `stopPropagation()` — so anything it claims by mistake
 * never receives the press at all. That is how MapLibre lost drag-to-pan
 * inside a database map view while its separately-bound wheel and click
 * handlers kept working, which reads as "the map is broken" rather than "the
 * canvas stole the mousedown".
 */

const dispatch = vi.hoisted(() => vi.fn());
const clearSelection = vi.hoisted(() => vi.fn());

vi.mock("@/components/canvas/canvas-editor-context.tsx", () => ({
  useCanvasEditorContext: () => ({
    clearSelection,
    dispatch,
    getRows: () => [
      {
        rowId: "row-1",
        effectiveBlock: { id: "b1", props: {}, type: "text" },
      },
    ],
  }),
}));
vi.mock("@/components/canvas/block-actions-menu.tsx", () => ({
  useBlockActionsMenu: () => ({ setOpenRowId: vi.fn() }),
}));
vi.mock("@/components/dnd/use-dnd.ts", () => ({ useDragState: () => false }));

function Harness({ surface }: { surface: "plain" | "pointer" }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useCanvasOverclick(rootRef);
  return (
    <div data-testid="root" ref={rootRef}>
      <div
        data-canvas-row-content=""
        data-canvas-row-id="row-1"
        data-canvas-row-shell=""
      >
        {surface === "pointer" ? (
          <div data-canvas-pointer-surface="" data-testid="target">
            <canvas />
          </div>
        ) : (
          <div data-testid="target">block content</div>
        )}
      </div>
    </div>
  );
}

function pressOn(element: Element): boolean {
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  element.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  cleanup();
  dispatch.mockClear();
});

describe("useCanvasOverclick", () => {
  it("claims a press on ordinary block content", () => {
    const { getByTestId } = render(<Harness surface="plain" />);

    expect(pressOn(getByTestId("target"))).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      placement: "end",
      rowId: "row-1",
      type: "focus.set",
    });
  });

  it("leaves a press inside a pointer surface alone", () => {
    const { getByTestId } = render(<Harness surface="pointer" />);
    const canvas = getByTestId("target").querySelector("canvas");

    expect(canvas).not.toBeNull();
    expect(pressOn(canvas as Element)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
