// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { handleCanvasSelectionArrowKeyDown } from "@/lib/canvas/canvas-keyboard-shortcuts.ts";

function createKeyboardEvent(
  key: string,
  options: {
    altKey?: boolean;
    shiftKey?: boolean;
    target?: EventTarget | null;
  } = {}
) {
  return {
    key,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
    ...(options.target === undefined ? {} : { target: options.target }),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe("handleCanvasSelectionArrowKeyDown", () => {
  it("moves the selected row on Option+Arrow when no block field is focused", () => {
    const moveRowUp = vi.fn();
    const event = createKeyboardEvent("ArrowUp", { altKey: true });

    const handled = handleCanvasSelectionArrowKeyDown(event, {
      moveRowUp,
      selectedCount: 1,
    });

    expect(handled).toBe(true);
    expect(moveRowUp).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("extends selection on Shift+Arrow when no block field is focused", () => {
    const extendSelectionDown = vi.fn();
    const event = createKeyboardEvent("ArrowDown", { shiftKey: true });

    const handled = handleCanvasSelectionArrowKeyDown(event, {
      extendSelectionDown,
      selectedCount: 1,
    });

    expect(handled).toBe(true);
    expect(extendSelectionDown).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("does not handle when a block field is focused", () => {
    const moveRowDown = vi.fn();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    const event = createKeyboardEvent("ArrowDown", { altKey: true });

    const handled = handleCanvasSelectionArrowKeyDown(event, {
      moveRowDown,
      selectedCount: 1,
    });

    expect(handled).toBe(false);
    expect(moveRowDown).not.toHaveBeenCalled();
    input.remove();
  });

  it("does not handle when nothing is selected", () => {
    const moveRowUp = vi.fn();
    const event = createKeyboardEvent("ArrowUp", { altKey: true });

    const handled = handleCanvasSelectionArrowKeyDown(event, {
      moveRowUp,
      selectedCount: 0,
    });

    expect(handled).toBe(false);
    expect(moveRowUp).not.toHaveBeenCalled();
  });
});
