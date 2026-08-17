/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseCellInlineEditor } from "@/components/database/database-cell-editor.tsx";
import type { GeocodeSearchOutcome } from "@/lib/geocode/geocode-search.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";

const updateDatabaseCell = vi.hoisted(() => vi.fn());
const searchGeocode = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  setDatabaseRowIcon: vi.fn(),
  updateDatabaseCell,
  updateDatabaseField: vi.fn(),
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabaseRowsCollection: { get: () => undefined },
}));

// Fine pointer keeps the popover presentation (the drawer path needs vaul +
// DeviceLayoutProvider scaffolding this test doesn't exercise).
vi.mock("@/components/layout/device-layout-provider.tsx", async (orig) => ({
  ...(await orig<object>()),
  useIsCoarsePrimaryPointer: () => false,
}));

vi.mock("@/lib/geocode/geocode-search.ts", () => ({ searchGeocode }));

const DROP_PIN_HINT = /drop a pin at 19.6144, 110.951/;
const ROW_ID = "row-1";
const FIELD: DatabaseField = { id: "f-place", name: "Place", type: "location" };

function renderEditor(value?: DatabaseCellValue) {
  const onStopEdit = vi.fn();
  render(
    <DatabaseCellInlineEditor
      field={FIELD}
      onNavigate={vi.fn()}
      onStopEdit={onStopEdit}
      rowId={ROW_ID}
      value={value}
    />
  );
  return { onStopEdit };
}

function typeIntoSearch(text: string): HTMLElement {
  const input = screen.getByLabelText("Place address or coordinates");
  fireEvent.change(input, { target: { value: text } });
  return input;
}

function resolveWith(outcome: GeocodeSearchOutcome): void {
  searchGeocode.mockResolvedValue(outcome);
}

afterEach(() => {
  cleanup();
  searchGeocode.mockReset();
});

describe("LocationCellPopoverEditor", () => {
  it("commits typed coordinates with no geocoding request", () => {
    const { onStopEdit } = renderEditor();
    const input = typeIntoSearch("19.6144, 110.951");

    // The offline path: the coordinates are the answer, so nothing is fetched.
    expect(screen.getByText(DROP_PIN_HINT)).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(searchGeocode).not.toHaveBeenCalled();
    expect(updateDatabaseCell).toHaveBeenCalledWith(ROW_ID, "f-place", {
      label: "19.6144, 110.951",
      lat: 19.6144,
      lng: 110.951,
    });
    expect(onStopEdit).toHaveBeenCalled();
  });

  it("searches an address on submit and commits the picked place", async () => {
    resolveWith({
      kind: "results",
      results: [
        { label: "Kourou, French Guiana", lat: 5.239, lng: -52.7683 },
        { label: "Kourou River, French Guiana", lat: 5.16, lng: -52.65 },
      ],
    });
    renderEditor();
    const input = typeIntoSearch("Kourou");

    // Never per keystroke — Nominatim's policy forbids autocomplete traffic.
    expect(searchGeocode).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("Kourou, French Guiana")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Kourou, French Guiana"));
    expect(updateDatabaseCell).toHaveBeenCalledWith(ROW_ID, "f-place", {
      label: "Kourou, French Guiana",
      lat: 5.239,
      lng: -52.7683,
    });
  });

  it("keeps the typed label committable when the search fails", async () => {
    resolveWith({
      kind: "error",
      message: "Could not reach the geocoding service.",
    });
    renderEditor();
    fireEvent.keyDown(typeIntoSearch("221B Baker Street"), { key: "Enter" });

    await waitFor(() => {
      expect(
        screen.getByText("Could not reach the geocoding service.")
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Save without coordinates"));

    // A label with no point: the row still says where it means, and the map
    // view counts it among the rows it cannot plot.
    expect(updateDatabaseCell).toHaveBeenCalledWith(ROW_ID, "f-place", {
      label: "221B Baker Street",
    });
  });

  it("offers the label when a search matches nothing", async () => {
    resolveWith({ kind: "results", results: [] });
    renderEditor();
    fireEvent.keyDown(typeIntoSearch("nowhere at all"), { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("No places matched that search.")).toBeTruthy();
    });
    expect(screen.getByText("Save without coordinates")).toBeTruthy();
  });

  it("clears a placed location", () => {
    renderEditor({ label: "Mahia Peninsula", lat: -39.262, lng: 177.8649 });
    fireEvent.click(screen.getByText("Clear"));
    expect(updateDatabaseCell).toHaveBeenCalledWith(ROW_ID, "f-place", null);
  });

  it("opens with the current label so it can be re-searched", () => {
    renderEditor({ label: "Mahia Peninsula", lat: -39.262, lng: 177.8649 });
    expect(
      screen.getByLabelText<HTMLInputElement>("Place address or coordinates")
        .value
    ).toBe("Mahia Peninsula");
  });
});
