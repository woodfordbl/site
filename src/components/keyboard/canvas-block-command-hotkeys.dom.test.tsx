/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCommandHotkeys } from "@/components/keyboard/use-command-hotkeys.ts";

function Harness({
  onDelete,
  onDuplicate,
}: {
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  useCommandHotkeys({
    "delete-block": onDelete,
    "duplicate-block": onDuplicate,
  });
  return <input data-testid="field" />;
}

function pressOn(element: Element, key: string, init: KeyboardEventInit = {}) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key, ...init })
  );
}

afterEach(() => {
  cleanup();
});

describe("canvas block command hotkeys", () => {
  it("fires delete and duplicate when no field is focused", () => {
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    render(<Harness onDelete={onDelete} onDuplicate={onDuplicate} />);

    pressOn(document.body, "Delete");
    pressOn(document.body, "Backspace");
    pressOn(document.body, "d", { ctrlKey: true });

    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  it("stays out of the way while a text field is focused", () => {
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    const { getByTestId } = render(
      <Harness onDelete={onDelete} onDuplicate={onDuplicate} />
    );
    const field = getByTestId("field");
    (field as HTMLInputElement).focus();

    pressOn(field, "Delete");
    pressOn(field, "d", { ctrlKey: true });

    expect(onDelete).not.toHaveBeenCalled();
    expect(onDuplicate).not.toHaveBeenCalled();
  });
});
