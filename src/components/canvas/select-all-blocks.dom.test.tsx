/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCommandHotkeys } from "@/components/keyboard/use-command-hotkeys.ts";
import { handleSelectAllBlocksKeyDown } from "@/lib/canvas/canvas-keyboard-shortcuts.ts";

function Harness({ selectAll }: { selectAll: () => void }) {
  useCommandHotkeys({
    "select-all-blocks": (event) => {
      handleSelectAllBlocksKeyDown(event, selectAll);
    },
  });
  return (
    <div>
      <p data-testid="block">Block text</p>
      <input data-canvas-field data-testid="field" />
    </div>
  );
}

/** jsdom resolves `Mod` to Ctrl (non-Apple platform), matching the registry combo. */
function pressSelectAll(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    key: "a",
  });
  target.dispatchEvent(event);
  return event;
}

function selectBlockText(block: Element): void {
  const range = document.createRange();
  range.selectNodeContents(block);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
});

describe("select all blocks", () => {
  it("selects every block and claims the keystroke when no field is focused", () => {
    const selectAll = vi.fn();
    const { getByTestId } = render(<Harness selectAll={selectAll} />);
    selectBlockText(getByTestId("block"));

    const event = pressSelectAll(document.body);

    expect(selectAll).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(window.getSelection()?.rangeCount).toBe(0);
  });

  it("leaves Mod+A to the field when the caret is in a block field", () => {
    const selectAll = vi.fn();
    const { getByTestId } = render(<Harness selectAll={selectAll} />);
    const field = getByTestId("field");
    field.focus();

    const event = pressSelectAll(field);

    expect(selectAll).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("keeps the caret's text range when a field is focused", () => {
    const selectAll = vi.fn();
    const { getByTestId } = render(<Harness selectAll={selectAll} />);
    selectBlockText(getByTestId("block"));
    getByTestId("field").focus();

    handleSelectAllBlocksKeyDown(
      new KeyboardEvent("keydown", { cancelable: true }),
      selectAll
    );

    expect(selectAll).not.toHaveBeenCalled();
    expect(window.getSelection()?.rangeCount).toBe(1);
  });
});
