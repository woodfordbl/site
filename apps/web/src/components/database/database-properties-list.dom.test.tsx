/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DatabasePropertiesList } from "@/components/database/database-properties-list.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  removeDatabaseField: vi.fn(),
  reorderDatabaseFields: vi.fn(),
}));

const DATABASE: LocalDatabase = {
  id: "db-1",
  name: "Tasks",
  primaryFieldId: "f-title",
  fields: [
    { id: "f-title", name: "Name", type: "text" },
    { id: "f-status", name: "Status", type: "select", options: [] },
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

function renderList() {
  return render(
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      <TooltipProvider delay={0}>
        <DatabasePropertiesList
          database={DATABASE}
          isVisible={() => true}
          onToggleVisible={vi.fn()}
        />
      </TooltipProvider>
    </DeviceLayoutProvider>
  );
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

describe("DatabasePropertiesList title row", () => {
  it("omits reorder, hide, and delete on the primary field", () => {
    renderList();

    expect(screen.queryByRole("button", { name: "Reorder Name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hide Name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Name" })).toBeNull();

    expect(screen.getByRole("button", { name: "Reorder Status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide Status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Status" })).toBeTruthy();
  });

  it("wraps the primary field name in a lock-hint tooltip trigger", () => {
    renderList();

    const trigger = document.querySelector('[data-slot="tooltip-trigger"]');
    expect(trigger).toBeTruthy();
    expect(trigger?.textContent).toContain("Name");
    expect(trigger?.textContent).toContain("Title");
  });
});
