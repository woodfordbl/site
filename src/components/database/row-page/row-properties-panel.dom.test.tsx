/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  RowPropertiesPanel,
  rowPropertyCellClassName,
} from "@/components/database/row-page/row-properties-panel.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  addDatabaseField: vi.fn(),
  duplicateDatabaseField: vi.fn(),
  removeDatabaseField: vi.fn(),
  setDatabaseRowPropertiesVisibleFieldIds: vi.fn(),
  updateDatabaseCell: vi.fn(),
  updateDatabaseField: vi.fn(),
  updateDatabaseView: vi.fn(),
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabasesCollection: {
    get: () => undefined,
  },
  localDatabaseRowsCollection: {
    get: () => undefined,
  },
}));

// The panel reads computed formula values from the stateful engine, which
// subscribes to the real collections on first use. This spacing test stubs
// the collections, so serve an empty overlay instead of booting the engine.
vi.mock("@/db/formula-engine.ts", () => ({
  useFormulaOverlay: () => new Map(),
}));

vi.mock("@/components/ui/menu-icon-rename-input.tsx", () => ({
  MenuIconRenameInput: () => <div data-testid="column-rename">Rename</div>,
  shouldCancelMenuCloseForIconPicker: () => false,
}));

const DATABASE: LocalDatabase = {
  id: "db-1",
  name: "Tasks",
  primaryFieldId: "f-title",
  fields: [
    { id: "f-title", name: "Name", type: "text" },
    { id: "f-tags", name: "Tags", type: "multiSelect", options: [] },
    { id: "f-done", name: "Done", type: "checkbox" },
  ],
  views: [
    {
      id: "view-1",
      name: "Table",
      type: "table",
      config: {},
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ROW: LocalDatabaseRow = {
  id: "row-1",
  databaseId: "db-1",
  values: {},
  order: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const TAGS_BUTTON_NAME = /Tags/i;
const WHITESPACE = /\s+/;

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
});

describe("RowPropertiesPanel cell spacing", () => {
  it("shares a fixed h-8 cell class (no py-0.5 drift on the name trigger)", () => {
    expect(rowPropertyCellClassName).toContain("h-8");
    expect(rowPropertyCellClassName).toContain("items-center");
    expect(rowPropertyCellClassName).not.toContain("py-0.5");
  });

  it("applies the shared cell class to both the property name and Empty value", () => {
    render(
      <DeviceLayoutProvider
        initialHints={{
          isCoarsePrimaryPointer: false,
          isNarrowViewport: false,
        }}
      >
        <RowPropertiesPanel database={DATABASE} row={ROW} />
      </DeviceLayoutProvider>
    );

    const nameTrigger = screen.getByRole("button", { name: TAGS_BUTTON_NAME });
    const emptyValue = screen.getByRole("button", { name: "Empty" });

    for (const token of rowPropertyCellClassName.split(WHITESPACE)) {
      expect(nameTrigger.className).toContain(token);
      expect(emptyValue.className).toContain(token);
    }
  });
});
