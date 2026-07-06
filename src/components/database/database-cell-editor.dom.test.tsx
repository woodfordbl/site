/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseCellInlineEditor } from "@/components/database/database-cell-editor.tsx";
import type { DatabaseField } from "@/lib/schemas/database.ts";

const updateDatabaseCell = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  updateDatabaseCell,
  updateDatabaseField: vi.fn(),
}));

// Only the select editor's "create option" path reads the collection; stub it
// so the module imports without booting the local DB.
vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabaseRowsCollection: { get: () => undefined },
}));

const TEXT_FIELD: DatabaseField = { id: "f-note", name: "Note", type: "text" };
const ROW_ID = "row-1";

// Below the inline/popover threshold, so text cells open the overflow popover.
const NARROW_WIDTH_PX = 96;
// At/above the threshold, so text cells edit inline in place.
const WIDE_WIDTH_PX = 320;

function renderEditor(overrides?: {
  onNavigate?: () => void;
  onStopEdit?: () => void;
  value?: string;
  width?: number;
}) {
  const onNavigate = overrides?.onNavigate ?? vi.fn();
  const onStopEdit = overrides?.onStopEdit ?? vi.fn();
  render(
    <DatabaseCellInlineEditor
      field={TEXT_FIELD}
      onNavigate={onNavigate}
      onStopEdit={onStopEdit}
      rowId={ROW_ID}
      value={overrides?.value ?? "hello"}
      width={overrides?.width ?? NARROW_WIDTH_PX}
    />
  );
  return { onNavigate, onStopEdit };
}

beforeEach(() => {
  updateDatabaseCell.mockClear();
  // Base UI's positioner observes size; jsdom lacks ResizeObserver.
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TextCellPopoverEditor", () => {
  it("autofocuses the overflow popover on the current value when opened", () => {
    renderEditor({ value: "hello" });
    const textarea = screen.getByLabelText("Note") as HTMLTextAreaElement;
    expect(textarea.value).toBe("hello");
    // The callback ref focuses synchronously the moment the textarea attaches,
    // so focus lands without waiting on Base UI's async initial-focus pass.
    expect(document.activeElement).toBe(textarea);
  });

  it("gives the popover a minimum width so narrow cells stay usable", () => {
    renderEditor({ value: "hello", width: NARROW_WIDTH_PX });
    const popup = screen
      .getByLabelText("Note")
      .closest("[data-slot='popover-content'], .overlay-popover-surface");
    expect(popup?.className).toContain("w-[max(var(--anchor-width),16rem)]");
  });

  it("edits inline (no popover) when the cell is wide enough", () => {
    renderEditor({ value: "hello", width: WIDE_WIDTH_PX });
    const field = screen.getByLabelText("Note");
    // Wide cells reuse the borderless inline input rather than the popover.
    expect(field.tagName).toBe("INPUT");
    expect(
      field.closest("[data-slot='popover-content'], .overlay-popover-surface")
    ).toBeNull();
  });

  it("commits the edited value and moves down on Enter", () => {
    const { onNavigate, onStopEdit } = renderEditor({ value: "hello" });
    const textarea = screen.getByLabelText("Note");
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(updateDatabaseCell).toHaveBeenCalledWith(
      ROW_ID,
      "f-note",
      "hello world"
    );
    expect(onNavigate).toHaveBeenCalledWith("down", {
      rowId: ROW_ID,
      fieldId: "f-note",
    });
    expect(onStopEdit).not.toHaveBeenCalled();
  });

  it("reverts without writing on Escape", () => {
    const { onStopEdit } = renderEditor({ value: "hello" });
    const textarea = screen.getByLabelText("Note");
    fireEvent.change(textarea, { target: { value: "changed" } });
    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(updateDatabaseCell).not.toHaveBeenCalled();
    expect(onStopEdit).toHaveBeenCalledTimes(1);
  });

  it("clears the cell when emptied", () => {
    renderEditor({ value: "hello" });
    const textarea = screen.getByLabelText("Note");
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(updateDatabaseCell).toHaveBeenCalledWith(ROW_ID, "f-note", null);
  });

  it("does not write when the value is unchanged", () => {
    const { onStopEdit } = renderEditor({ value: "hello" });
    const textarea = screen.getByLabelText("Note");
    fireEvent.blur(textarea);

    expect(updateDatabaseCell).not.toHaveBeenCalled();
    expect(onStopEdit).toHaveBeenCalledTimes(1);
  });
});
