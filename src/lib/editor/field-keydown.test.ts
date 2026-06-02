import { describe, expect, it, vi } from "vitest";

import {
  handleBlockModifierArrowKeyDown,
  handleSlashMenuKeyDown,
} from "@/lib/editor/field-keydown.ts";

function createKeyboardEvent(
  key: string,
  options: { altKey?: boolean; shiftKey?: boolean } = {}
) {
  return {
    key,
    altKey: options.altKey ?? false,
    shiftKey: options.shiftKey ?? false,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent<HTMLInputElement>;
}

describe("handleBlockModifierArrowKeyDown", () => {
  it("moves the row on Option+Arrow", () => {
    const onMoveRowUp = vi.fn();
    const event = createKeyboardEvent("ArrowUp", { altKey: true });

    const handled = handleBlockModifierArrowKeyDown(event, { onMoveRowUp });

    expect(handled).toBe(true);
    expect(onMoveRowUp).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("extends selection on Shift+Arrow", () => {
    const onExtendSelectionDown = vi.fn();
    const event = createKeyboardEvent("ArrowDown", { shiftKey: true });

    const handled = handleBlockModifierArrowKeyDown(event, {
      onExtendSelectionDown,
    });

    expect(handled).toBe(true);
    expect(onExtendSelectionDown).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("prefers Shift+Arrow when both modifiers are held", () => {
    const onMoveRowDown = vi.fn();
    const onExtendSelectionDown = vi.fn();
    const event = createKeyboardEvent("ArrowDown", {
      altKey: true,
      shiftKey: true,
    });

    const handled = handleBlockModifierArrowKeyDown(event, {
      onExtendSelectionDown,
      onMoveRowDown,
    });

    expect(handled).toBe(true);
    expect(onExtendSelectionDown).toHaveBeenCalled();
    expect(onMoveRowDown).not.toHaveBeenCalled();
  });
});

describe("handleSlashMenuKeyDown", () => {
  describe("root phase", () => {
    it("navigates down on ArrowDown", () => {
      const onNavigate = vi.fn();
      const event = createKeyboardEvent("ArrowDown");

      const handled = handleSlashMenuKeyDown(event, {
        phase: "root",
        onNavigate,
      });

      expect(handled).toBe(true);
      expect(onNavigate).toHaveBeenCalledWith("down");
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("navigates up on ArrowUp", () => {
      const onNavigate = vi.fn();
      const event = createKeyboardEvent("ArrowUp");

      const handled = handleSlashMenuKeyDown(event, {
        phase: "root",
        onNavigate,
      });

      expect(handled).toBe(true);
      expect(onNavigate).toHaveBeenCalledWith("up");
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("confirms on Enter without Shift", () => {
      const onConfirm = vi.fn();
      const event = createKeyboardEvent("Enter");

      const handled = handleSlashMenuKeyDown(event, {
        phase: "root",
        onConfirm,
      });

      expect(handled).toBe(true);
      expect(onConfirm).toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("does not confirm on Shift+Enter", () => {
      const onConfirm = vi.fn();
      const event = createKeyboardEvent("Enter", { shiftKey: true });

      const handled = handleSlashMenuKeyDown(event, {
        phase: "root",
        onConfirm,
      });

      expect(handled).toBe(false);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("closes on Escape", () => {
      const onClose = vi.fn();
      const event = createKeyboardEvent("Escape");

      const handled = handleSlashMenuKeyDown(event, {
        phase: "root",
        onClose,
      });

      expect(handled).toBe(true);
      expect(onClose).toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("dismisses on Escape when onDismiss is provided", () => {
      const onDismiss = vi.fn();
      const onClose = vi.fn();
      const event = createKeyboardEvent("Escape");

      const handled = handleSlashMenuKeyDown(event, {
        phase: "root",
        onClose,
        onDismiss,
      });

      expect(handled).toBe(true);
      expect(onDismiss).toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("passes through unhandled keys", () => {
      const event = createKeyboardEvent("a");

      const handled = handleSlashMenuKeyDown(event, {
        phase: "root",
        onNavigate: vi.fn(),
        onConfirm: vi.fn(),
        onClose: vi.fn(),
      });

      expect(handled).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe("link phase", () => {
    it("returns to root on Escape", () => {
      const onLinkBack = vi.fn();
      const event = createKeyboardEvent("Escape");

      const handled = handleSlashMenuKeyDown(event, {
        phase: "link",
        onLinkBack,
      });

      expect(handled).toBe(true);
      expect(onLinkBack).toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("passes through non-Escape keys", () => {
      const event = createKeyboardEvent("ArrowDown");

      const handled = handleSlashMenuKeyDown(event, {
        phase: "link",
        onLinkBack: vi.fn(),
      });

      expect(handled).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});
