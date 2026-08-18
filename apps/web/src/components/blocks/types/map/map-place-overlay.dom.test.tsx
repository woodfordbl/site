/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  MapPlaceMenuItems,
  MapPlaceOverlay,
} from "@/components/blocks/types/map/map-place-overlay.tsx";
import { DeviceLayoutProvider } from "@/components/layout/device-layout-provider.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu.tsx";
import type { DatabaseField } from "@/lib/schemas/database.ts";

/**
 * @fileoverview The corner control on a property-bound `map` block: the
 * address it is showing, and the ⋯ menu that changes or ends the binding.
 */

const PLACE: DatabaseField = { id: "f-place", name: "Place", type: "location" };
const PAD: DatabaseField = { id: "f-pad", name: "Pad", type: "location" };

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

function withLayout(children: React.ReactNode) {
  return (
    <DeviceLayoutProvider
      initialHints={{ isCoarsePrimaryPointer: false, isNarrowViewport: false }}
    >
      {children}
    </DeviceLayoutProvider>
  );
}

function renderMenu(overrides?: {
  locationFields?: DatabaseField[];
  onFollowField?: (fieldId: string) => void;
  onStopFollowing?: () => void;
}) {
  const onFollowField = overrides?.onFollowField ?? vi.fn();
  const onStopFollowing = overrides?.onStopFollowing ?? vi.fn();
  render(
    withLayout(
      <DropdownMenu open>
        <DropdownMenuContent>
          <MapPlaceMenuItems
            locationFields={overrides?.locationFields ?? [PLACE, PAD]}
            onFollowField={onFollowField}
            onStopFollowing={onStopFollowing}
            selectedFieldId="f-place"
          />
        </DropdownMenuContent>
      </DropdownMenu>
    )
  );
  return { onFollowField, onStopFollowing };
}

describe("MapPlaceOverlay", () => {
  it("shows the address, and names the menu for what it edits", () => {
    render(
      withLayout(
        <MapPlaceOverlay
          label="Kourou, French Guiana"
          locationFields={[PLACE]}
          onFollowField={() => undefined}
          onStopFollowing={() => undefined}
          selectedFieldId="f-place"
        />
      )
    );

    expect(screen.getByText("Kourou, French Guiana")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Location options" })
    ).toBeTruthy();
  });
});

describe("MapPlaceMenuItems", () => {
  it("offers every location property, marking the one followed", () => {
    renderMenu();

    expect(
      screen.getAllByRole("menuitemradio").map((item) => item.textContent)
    ).toEqual(["Place", "Pad"]);

    expect(
      screen
        .getByRole("menuitemradio", { name: "Place" })
        .getAttribute("aria-checked")
    ).toBe("true");
    expect(
      screen
        .getByRole("menuitemradio", { name: "Pad" })
        .getAttribute("aria-checked")
    ).toBe("false");
  });

  it("offers a way out", () => {
    const { onStopFollowing } = renderMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Stop following" }));

    expect(onStopFollowing).toHaveBeenCalled();
  });

  it("still unbinds when every location property is gone", () => {
    // The state a bound block lands in when its property is deleted: the menu
    // is the only way back, so it must not collapse to an empty list.
    const { onStopFollowing } = renderMenu({ locationFields: [] });

    fireEvent.click(screen.getByRole("menuitem", { name: "Stop following" }));

    expect(onStopFollowing).toHaveBeenCalled();
  });
});
