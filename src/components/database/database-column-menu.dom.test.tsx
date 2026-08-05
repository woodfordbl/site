/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DatabaseColumnMenu } from "@/components/database/database-column-menu.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import type { DatabaseField, DatabaseView } from "@/lib/schemas/database.ts";
import { assertNoOrphanMenuSeparators } from "@/lib/ui/menu-separators.ts";

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  addDatabaseField: vi.fn(),
  duplicateDatabaseField: vi.fn(),
  removeDatabaseField: vi.fn(),
  updateDatabaseField: vi.fn(),
  updateDatabaseView: vi.fn(),
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabasesCollection: {
    get: () => ({ fields: [] }),
  },
}));

vi.mock("@/db/queries/use-database.ts", () => ({
  useDatabase: () => ({
    id: "db-1",
    fields: [],
    views: [],
  }),
  useDatabaseRows: () => [],
}));

vi.mock("@/components/ui/menu-icon-rename-input.tsx", () => ({
  MenuIconRenameInput: () => <div data-testid="column-rename">Rename</div>,
  shouldCancelMenuCloseForIconPicker: () => false,
}));

const VIEW: DatabaseView = {
  id: "view-1",
  name: "Table",
  type: "table",
  config: {},
};

const TEXT_FIELD: DatabaseField = {
  id: "f-text",
  name: "Name",
  type: "text",
};

const SYNCED_TEXT_FIELD: DatabaseField = {
  id: "f-synced",
  name: "Ticker",
  type: "text",
  sourceKey: "symbol",
};

async function renderColumnMenu(
  field: DatabaseField,
  actions: "all" | "schema" = "all"
) {
  const openMenuRef = {
    current: null as (() => void) | null,
  };

  render(
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      <DatabaseColumnMenu
        actions={actions}
        databaseId="db-1"
        displayFieldIds={[field.id]}
        field={field}
        isPrimary={field.id === "f-text"}
        openMenuRef={openMenuRef}
        view={VIEW}
      >
        <span>Column</span>
      </DatabaseColumnMenu>
    </DeviceLayoutProvider>
  );

  await waitFor(() => {
    expect(openMenuRef.current).not.toBeNull();
  });
  openMenuRef.current?.();
  return screen.findByRole("menu");
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

describe("DatabaseColumnMenu separators", () => {
  it("uses the viewport-constrained standard action-menu width", async () => {
    const menu = await renderColumnMenu(TEXT_FIELD);

    expect(menu.className).toContain("w-[16.5rem]");
    expect(menu.className).toContain("min-w-0");
    expect(menu.className).toContain("max-w-(--available-width)");
  });

  it("has no orphan separators for a local text column", async () => {
    const menu = await renderColumnMenu(TEXT_FIELD);
    expect(screen.getByText("Change type")).toBeTruthy();
    expect(screen.getByText("Sort ascending")).toBeTruthy();
    assertNoOrphanMenuSeparators(menu);
  });

  it("has no orphan separators for a synced text column", async () => {
    const menu = await renderColumnMenu(SYNCED_TEXT_FIELD);
    expect(screen.getByText("Synced")).toBeTruthy();
    expect(screen.queryByText("Change type")).toBeNull();
    expect(screen.getByText("Sort ascending")).toBeTruthy();
    assertNoOrphanMenuSeparators(menu);
  });

  it("has no orphan separators when only schema actions are shown", async () => {
    const menu = await renderColumnMenu(SYNCED_TEXT_FIELD, "schema");
    expect(screen.queryByText("Sort ascending")).toBeNull();
    expect(screen.getByText("Duplicate property")).toBeTruthy();
    assertNoOrphanMenuSeparators(menu);
  });
});
