/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MapRecenter } from "@/components/maps/map-recenter.tsx";

/**
 * @fileoverview The camera has to follow a point that changes after mount —
 * mapcn only reads `center` in the MapLibre constructor, so a map bound to a
 * row's location property sat still while the row moved underneath it.
 *
 * The two halves matter equally: it moves for a changed place, and it stays
 * put for anything else, so a reader who has panned is not yanked back on
 * every unrelated re-render.
 */

const mapMock = vi.hoisted(() => ({
  current: null as { flyTo: ReturnType<typeof vi.fn> } | null,
}));

vi.mock("@/components/ui/map.tsx", () => ({
  useMap: () => ({ map: mapMock.current }),
}));

function mountedMap() {
  const flyTo = vi.fn();
  mapMock.current = { flyTo };
  return flyTo;
}

describe("MapRecenter", () => {
  it("leaves the camera where the map was built", () => {
    const flyTo = mountedMap();

    render(<MapRecenter center={[-52.7683, 5.239]} />);

    expect(flyTo).not.toHaveBeenCalled();
  });

  it("flies to a place the row switched to", () => {
    const flyTo = mountedMap();
    const view = render(<MapRecenter center={[-52.7683, 5.239]} />);

    view.rerender(<MapRecenter center={[-80.577, 28.4889]} />);

    expect(flyTo).toHaveBeenCalledTimes(1);
    expect(flyTo.mock.calls[0][0]).toMatchObject({
      center: [-80.577, 28.4889],
    });
  });

  it("does not touch a zoom the reader chose", () => {
    const flyTo = mountedMap();
    const view = render(<MapRecenter center={[-52.7683, 5.239]} />);

    view.rerender(<MapRecenter center={[-80.577, 28.4889]} />);

    expect(flyTo.mock.calls[0][0]).not.toHaveProperty("zoom");
  });

  it("ignores a re-render that reaches the same point", () => {
    const flyTo = mountedMap();
    const view = render(<MapRecenter center={[-52.7683, 5.239]} />);

    // A fresh array every render is the norm — the coordinates are what count.
    view.rerender(<MapRecenter center={[-52.7683, 5.239]} />);

    expect(flyTo).not.toHaveBeenCalled();
  });

  it("waits for a map rather than throwing without one", () => {
    mapMock.current = null;

    expect(() =>
      render(<MapRecenter center={[-52.7683, 5.239]} />)
    ).not.toThrow();
  });
});
