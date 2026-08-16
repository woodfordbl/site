/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { BlockActionsMenuProvider } from "@/components/canvas/block-actions-menu.tsx";
import {
  type CanvasEditorActions,
  CanvasEditorContext,
} from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasRowShell } from "@/components/canvas/canvas-row-shell.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import type { Block } from "@/lib/schemas/block.ts";

const rows = buildBlockTree([
  { id: "row-1", type: "text", props: { text: "Hello" } } as Block,
]);
const row = rows[0];

beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

afterEach(cleanup);

function renderShell(
  toggleRowSelection: CanvasEditorActions["toggleRowSelection"],
  children: ReactNode
) {
  const actions = { toggleRowSelection } as unknown as CanvasEditorActions;

  return render(
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      <BlockActionsMenuProvider>
        <CanvasEditorContext.Provider value={actions}>
          <CanvasRowShell row={row}>{children}</CanvasRowShell>
        </CanvasEditorContext.Provider>
      </BlockActionsMenuProvider>
    </DeviceLayoutProvider>
  );
}

describe("CanvasRowShell Shift+click", () => {
  it("extends block selection on Shift+click of row content", () => {
    const toggleRowSelection = vi.fn();
    renderShell(toggleRowSelection, <p>plain content</p>);
    fireEvent.pointerDown(screen.getByText("plain content"), {
      button: 0,
      shiftKey: true,
    });
    expect(toggleRowSelection).toHaveBeenCalledWith("row-1", {
      shiftKey: true,
    });
  });

  it("does not select the block when Shift+clicking an ignored nested widget", () => {
    const toggleRowSelection = vi.fn();
    renderShell(
      toggleRowSelection,
      <div data-canvas-shift-select-ignore="">
        <button type="button">Select row</button>
      </div>
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Select row" }), {
      button: 0,
      shiftKey: true,
    });
    expect(toggleRowSelection).not.toHaveBeenCalled();
  });

  it("does not select the block on a regular click of an ignored widget", () => {
    const toggleRowSelection = vi.fn();
    renderShell(
      toggleRowSelection,
      <div data-canvas-shift-select-ignore="">
        <button type="button">Select row</button>
      </div>
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Select row" }), {
      button: 0,
    });
    expect(toggleRowSelection).not.toHaveBeenCalled();
  });
});
