import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { createConfirmDialogKeyDownHandler } from "@/lib/dialog/confirm-dialog-keys.ts";

function createKeyboardEvent(key: string): {
  event: KeyboardEvent<HTMLDivElement>;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    key,
    preventDefault,
    stopPropagation,
  } as unknown as KeyboardEvent<HTMLDivElement>;
  return { event, preventDefault, stopPropagation };
}

describe("createConfirmDialogKeyDownHandler", () => {
  it("confirms on Enter", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const handler = createConfirmDialogKeyDownHandler({ onCancel, onConfirm });
    const { event, preventDefault, stopPropagation } =
      createKeyboardEvent("Enter");

    handler(event);

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("cancels on Escape", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const handler = createConfirmDialogKeyDownHandler({ onCancel, onConfirm });
    const { event, preventDefault, stopPropagation } =
      createKeyboardEvent("Escape");

    handler(event);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("does not confirm on Enter when confirmDisabled", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const handler = createConfirmDialogKeyDownHandler({
      confirmDisabled: true,
      onCancel,
      onConfirm,
    });
    const { event, preventDefault, stopPropagation } =
      createKeyboardEvent("Enter");

    handler(event);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});
