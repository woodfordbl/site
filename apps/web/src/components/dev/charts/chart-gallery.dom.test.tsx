/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ChartGallerySection } from "@/components/dev/charts/chart-gallery.tsx";

/**
 * @fileoverview Smoke coverage for the dev chart gallery.
 *
 * Every mark the site can draw has a definition in the gallery, so rendering the
 * page exercises all of them at once: a spec that fails to compile a scene —
 * a mark whose channels do not match its data, a scale that cannot resolve its
 * domain — throws here rather than only in the browser. This is the cheapest
 * check that the whole chart surface still works.
 */

vi.mock("@/components/layout/theme-provider.tsx", () => ({
  useSiteAppearance: () => ({ chartPalette: "colorful" }),
}));

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.ResizeObserver = class {
    observe(): void {
      return;
    }
    unobserve(): void {
      return;
    }
    disconnect(): void {
      return;
    }
  };
});

afterEach(cleanup);

describe("ChartGallerySection", () => {
  it("renders every gallery chart as an SVG scene", () => {
    const { container } = render(<ChartGallerySection />);
    const charts = container.querySelectorAll("svg.ts-chart");
    // One per gallery entry — 13 Cartesian variants plus 5 polar.
    expect(charts).toHaveLength(18);
    for (const chart of charts) {
      expect(chart.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("labels each chart variant", () => {
    render(<ChartGallerySection />);
    for (const title of [
      "Area",
      "Area · stacked",
      "Bar · grouped",
      "Bar · diverging",
      "Line · step",
      "Pie · donut",
      "Radar",
      "Radial bars",
    ]) {
      expect(screen.getByText(title)).toBeDefined();
    }
  });

  it("scopes the grid to the selected palette", () => {
    const { container } = render(<ChartGallerySection />);
    // The default selection, plus one scope per palette swatch row.
    expect(
      container.querySelectorAll('[data-chart-palette="colorful"]').length
    ).toBeGreaterThan(1);
  });
});
