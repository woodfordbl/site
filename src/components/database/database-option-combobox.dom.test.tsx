/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DatabaseOptionCombobox } from "@/components/database/database-option-combobox.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import type { DatabaseSelectOption } from "@/lib/schemas/database.ts";

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  updateDatabaseField: vi.fn(),
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabasesCollection: {
    get: () => undefined,
  },
}));

const OPTIONS: readonly DatabaseSelectOption[] = [
  { color: "blue", id: "opt-this", name: "This" },
  { color: "green", id: "opt-that", name: "That" },
];

const THIS_OPTION_NAME = /^This$/;
const THAT_OPTION_NAME = /^That$/;

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
});

function renderCombobox(selectedIds: readonly string[] = ["opt-this"]) {
  const onToggleOption = vi.fn();
  render(
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      <DatabaseOptionCombobox
        fieldId="f-tags"
        multiple
        onToggleOption={onToggleOption}
        options={OPTIONS}
        selectedIds={selectedIds}
      />
    </DeviceLayoutProvider>
  );
  return { onToggleOption };
}

describe("DatabaseOptionCombobox", () => {
  it("shows selection via list checkmarks without a top chip strip", () => {
    renderCombobox(["opt-this"]);

    expect(screen.getByLabelText("Search options")).toBeTruthy();
    expect(screen.queryByLabelText("Remove This")).toBeNull();
    expect(screen.queryByLabelText("Remove That")).toBeNull();

    const thisRow = screen.getByRole("button", { name: THIS_OPTION_NAME });
    const thatRow = screen.getByRole("button", { name: THAT_OPTION_NAME });
    expect(thisRow.querySelector("svg")).not.toBeNull();
    expect(thatRow.querySelector("svg")).toBeNull();
  });

  it("toggles options from the list rows", () => {
    const { onToggleOption } = renderCombobox(["opt-this"]);

    fireEvent.click(screen.getByRole("button", { name: THAT_OPTION_NAME }));
    expect(onToggleOption).toHaveBeenCalledWith("opt-that");
  });
});
