/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DatabaseViewMenu } from "@/components/database/database-view-menu.tsx";
import { DatabaseViewSwitcher } from "@/components/database/database-view-switcher.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import type { DatabaseView } from "@/lib/schemas/database.ts";

const updateDatabaseView = vi.fn();
const duplicateDatabaseView = vi.fn();
const removeDatabaseView = vi.fn();

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  addDatabaseView: vi.fn(),
  duplicateDatabaseView: (...args: unknown[]) => duplicateDatabaseView(...args),
  removeDatabaseView: (...args: unknown[]) => removeDatabaseView(...args),
  reorderDatabaseViews: vi.fn(),
  updateDatabaseView: (...args: unknown[]) => updateDatabaseView(...args),
}));

vi.mock("@/components/pages/page-icon-display.tsx", () => ({
  PageIconDisplay: ({ icon }: { icon: string }) => (
    <span data-testid="page-icon">{icon}</span>
  ),
}));

vi.mock("@/components/ui/menu-icon-rename-input.tsx", () => ({
  MenuIconRenameInput: ({
    ariaLabelName,
    draftName,
    onCommit,
    onDraftNameChange,
    onIconRemove,
    onIconSelect,
    onSubmit,
  }: {
    ariaLabelName: string;
    draftName: string;
    onCommit: () => void;
    onDraftNameChange: (value: string) => void;
    onIconRemove: () => void;
    onIconSelect: (icon: string) => void;
    onSubmit: () => void;
  }) => (
    <div data-testid="view-rename">
      <input
        aria-label={ariaLabelName}
        onBlur={onCommit}
        onChange={(event) => onDraftNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onSubmit();
          }
        }}
        value={draftName}
      />
      <button
        aria-label="Change view icon"
        onClick={() => onIconSelect("IconStar")}
        type="button"
      >
        icon
      </button>
      <button
        aria-label="Remove view icon"
        onClick={onIconRemove}
        type="button"
      >
        remove
      </button>
    </div>
  ),
  shouldCancelMenuCloseForIconPicker: () => false,
}));

const TABLE_VIEW: DatabaseView = {
  id: "view-table",
  name: "Table",
  type: "table",
  config: {},
};

const CHART_VIEW: DatabaseView = {
  id: "view-chart",
  name: "Chart",
  type: "chart",
  config: {},
  icon: "IconStar",
};

const TABLE_TAB_NAME = /Table/i;
const DUPLICATE_VIEW_ITEM = /Duplicate view/i;
const DELETE_VIEW_ITEM = /Delete view/i;

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
  updateDatabaseView.mockReset();
  duplicateDatabaseView.mockReset();
  removeDatabaseView.mockReset();
});

async function openViewMenu(
  view: DatabaseView = TABLE_VIEW,
  options?: { canDelete?: boolean }
) {
  const onViewIdChange = vi.fn();
  render(
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      <DatabaseViewMenu
        canDelete={options?.canDelete ?? true}
        databaseId="db-1"
        onViewIdChange={onViewIdChange}
        view={view}
      >
        <button type="button">{view.name}</button>
      </DatabaseViewMenu>
    </DeviceLayoutProvider>
  );

  fireEvent.contextMenu(screen.getByRole("button", { name: view.name }));
  const menu = await screen.findByRole("menu");
  return { menu, onViewIdChange };
}

describe("DatabaseViewMenu (right-click)", () => {
  it("opens on context menu with rename, icon, Duplicate view, and Delete view", async () => {
    const { menu } = await openViewMenu(TABLE_VIEW);

    expect(screen.getByLabelText("Rename view Table")).toBeTruthy();
    expect(screen.getByLabelText("Change view icon")).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: DUPLICATE_VIEW_ITEM })
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: DELETE_VIEW_ITEM })
    ).toBeTruthy();
    expect(menu.textContent).toContain("Table");
  });

  it("renames the view on Enter", async () => {
    await openViewMenu(TABLE_VIEW);
    const input = screen.getByLabelText("Rename view Table");
    fireEvent.change(input, { target: { value: "Markets" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(updateDatabaseView).toHaveBeenCalledWith("db-1", "view-table", {
      name: "Markets",
    });
  });

  it("sets and clears a custom icon", async () => {
    await openViewMenu(CHART_VIEW);
    fireEvent.click(screen.getByLabelText("Change view icon"));
    expect(updateDatabaseView).toHaveBeenCalledWith("db-1", "view-chart", {
      icon: "IconStar",
    });
    fireEvent.click(screen.getByLabelText("Remove view icon"));
    expect(updateDatabaseView).toHaveBeenCalledWith("db-1", "view-chart", {
      icon: undefined,
    });
  });

  it("duplicates and activates the copy", async () => {
    duplicateDatabaseView.mockReturnValue({
      ...TABLE_VIEW,
      id: "view-copy",
      name: "Table copy",
    });
    const { onViewIdChange } = await openViewMenu(TABLE_VIEW);

    fireEvent.click(
      screen.getByRole("menuitem", { name: DUPLICATE_VIEW_ITEM })
    );

    expect(duplicateDatabaseView).toHaveBeenCalledWith("db-1", "view-table");
    expect(onViewIdChange).toHaveBeenCalledWith("view-copy");
  });

  it("deletes when more than one view exists", async () => {
    await openViewMenu(TABLE_VIEW, { canDelete: true });
    fireEvent.click(screen.getByRole("menuitem", { name: DELETE_VIEW_ITEM }));
    expect(removeDatabaseView).toHaveBeenCalledWith("db-1", "view-table");
  });

  it("disables Delete for the last remaining view", async () => {
    await openViewMenu(TABLE_VIEW, { canDelete: false });
    const deleteItem = screen.getByRole("menuitem", { name: DELETE_VIEW_ITEM });
    const disabled =
      deleteItem.getAttribute("aria-disabled") === "true" ||
      deleteItem.hasAttribute("data-disabled") ||
      deleteItem.getAttribute("data-disabled") === "";
    expect(disabled).toBe(true);
  });
});

describe("DatabaseViewSwitcher edit-mode tabs", () => {
  it("wraps each tab so right-click opens the view menu", async () => {
    const onViewIdChange = vi.fn();
    render(
      <DeviceLayoutProvider
        initialHints={{
          isCoarsePrimaryPointer: false,
          isNarrowViewport: false,
        }}
      >
        <DatabaseViewSwitcher
          activeViewId={TABLE_VIEW.id}
          databaseId="db-1"
          mode="edit"
          onViewIdChange={onViewIdChange}
          views={[TABLE_VIEW, CHART_VIEW]}
        />
      </DeviceLayoutProvider>
    );

    fireEvent.contextMenu(screen.getByRole("tab", { name: TABLE_TAB_NAME }));

    await waitFor(() => {
      expect(screen.getByRole("menu")).toBeTruthy();
    });
    expect(screen.getByLabelText("Rename view Table")).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: DUPLICATE_VIEW_ITEM })
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: DELETE_VIEW_ITEM })
    ).toBeTruthy();
  });

  it("does not wrap tabs with a context menu in view mode", () => {
    render(
      <DeviceLayoutProvider
        initialHints={{
          isCoarsePrimaryPointer: false,
          isNarrowViewport: false,
        }}
      >
        <DatabaseViewSwitcher
          activeViewId={TABLE_VIEW.id}
          databaseId="db-1"
          mode="view"
          onViewIdChange={vi.fn()}
          views={[TABLE_VIEW, CHART_VIEW]}
        />
      </DeviceLayoutProvider>
    );

    fireEvent.contextMenu(screen.getByRole("tab", { name: TABLE_TAB_NAME }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("marks edit-mode tabs as drag sources for reorder", () => {
    render(
      <DeviceLayoutProvider
        initialHints={{
          isCoarsePrimaryPointer: false,
          isNarrowViewport: false,
        }}
      >
        <DatabaseViewSwitcher
          activeViewId={TABLE_VIEW.id}
          databaseId="db-1"
          mode="edit"
          onViewIdChange={vi.fn()}
          views={[TABLE_VIEW, CHART_VIEW]}
        />
      </DeviceLayoutProvider>
    );

    const tableTab = screen.getByRole("tab", { name: TABLE_TAB_NAME });
    expect(tableTab.getAttribute("data-database-view-tab-id")).toBe(
      "view-table"
    );
    expect(tableTab.getAttribute("draggable")).toBe("true");
  });

  it("does not mark view-mode tabs as drag sources", () => {
    render(
      <DeviceLayoutProvider
        initialHints={{
          isCoarsePrimaryPointer: false,
          isNarrowViewport: false,
        }}
      >
        <DatabaseViewSwitcher
          activeViewId={TABLE_VIEW.id}
          databaseId="db-1"
          mode="view"
          onViewIdChange={vi.fn()}
          views={[TABLE_VIEW, CHART_VIEW]}
        />
      </DeviceLayoutProvider>
    );

    const tableTab = screen.getByRole("tab", { name: TABLE_TAB_NAME });
    expect(tableTab.getAttribute("data-database-view-tab-id")).toBeNull();
    expect(tableTab.getAttribute("draggable")).not.toBe("true");
  });
});
