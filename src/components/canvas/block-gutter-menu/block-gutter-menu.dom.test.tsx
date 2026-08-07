/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  BlockActionsMenuProvider,
  useBlockActionsMenu,
} from "@/components/canvas/block-actions-menu.tsx";
import { BlockGutter } from "@/components/canvas/block-gutter.tsx";
import { BlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu.tsx";
import {
  type CanvasEditorActions,
  CanvasEditorContext,
  CanvasEditorStateContext,
} from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasMenuProvider } from "@/components/canvas/canvas-menu-context.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu.tsx";
import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { assertNoOrphanMenuSeparators } from "@/lib/ui/menu-separators.ts";

const ROW_ID = "divider-1";

const rows = buildBlockTree([
  { id: ROW_ID, type: "divider", props: {} } as Block,
]);

const editorActions = {
  dispatch: () => undefined,
} as unknown as CanvasEditorActions;

function CanvasHarness({ children }: { children: React.ReactNode }) {
  return (
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      <BlockActionsMenuProvider>
        <CanvasEditorContext.Provider value={editorActions}>
          <CanvasEditorStateContext.Provider value={{ clipboard: null, rows }}>
            {children}
          </CanvasEditorStateContext.Provider>
        </CanvasEditorContext.Provider>
      </BlockActionsMenuProvider>
    </DeviceLayoutProvider>
  );
}

function renderMenu(onDelete: () => void) {
  return render(
    <CanvasHarness>
      <DropdownMenu open>
        <DropdownMenuContent>
          <BlockGutterMenu onDelete={onDelete} rowId={ROW_ID} />
        </DropdownMenuContent>
      </DropdownMenu>
    </CanvasHarness>
  );
}

function OpenMenuOnMount() {
  const { setOpenRowId } = useBlockActionsMenu();

  useEffect(() => {
    setOpenRowId(ROW_ID);
  }, [setOpenRowId]);

  return null;
}

function renderOpenGutter(handlers: {
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  return render(
    <CanvasHarness>
      <CanvasMenuProvider>
        <OpenMenuOnMount />
        <BlockGutter
          onDelete={handlers.onDelete}
          onDuplicate={handlers.onDuplicate}
          onInsert={() => undefined}
          rowId={ROW_ID}
        />
      </CanvasMenuProvider>
    </CanvasHarness>
  );
}

function searchField(): HTMLInputElement {
  return screen.getByLabelText("Search actions") as HTMLInputElement;
}

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

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("BlockGutterMenu row actions", () => {
  it("deletes the row when Delete is clicked", () => {
    const onDelete = vi.fn();
    renderMenu(onDelete);

    screen.getByText("Delete").click();

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders no separator after the last item", () => {
    renderMenu(() => undefined);

    const menu = screen.getByRole("menu");
    assertNoOrphanMenuSeparators(menu);
  });

  it("has no orphan separators without timestamps", () => {
    renderMenu(() => undefined);

    // Divider blocks have no LocalBlock timestamps in an empty localStorage,
    // so the timestamps footer (and its leading separator) must not appear.
    expect(screen.queryByText("Added")).toBeNull();
    assertNoOrphanMenuSeparators(screen.getByRole("menu"));
  });

  it("shows a D key shortcut next to Delete", () => {
    renderMenu(() => undefined);

    const deleteItem = screen
      .getByText("Delete")
      .closest("[data-slot='dropdown-menu-item']");
    expect(deleteItem).not.toBeNull();
    expect(deleteItem?.querySelector("[data-slot='kbd']")?.textContent).toBe(
      "D"
    );
  });
});

describe("BlockGutter menu keyboard routing", () => {
  it("deletes the row when D is pressed with the menu open", () => {
    const onDelete = vi.fn();
    renderOpenGutter({ onDelete, onDuplicate: () => undefined });

    fireEvent.keyDown(searchField(), { key: "d" });

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("duplicates the row when Mod+D is pressed with the menu open", () => {
    const onDuplicate = vi.fn();
    renderOpenGutter({ onDelete: () => undefined, onDuplicate });

    fireEvent.keyDown(searchField(), { ctrlKey: true, key: "d" });

    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  it("leaves the keys to the search field once it holds a query", () => {
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    renderOpenGutter({ onDelete, onDuplicate });

    const field = searchField();
    fireEvent.change(field, { target: { value: "del" } });
    fireEvent.keyDown(field, { key: "d" });
    fireEvent.keyDown(field, { key: "Backspace" });

    expect(onDelete).not.toHaveBeenCalled();
    expect(onDuplicate).not.toHaveBeenCalled();
  });
});
