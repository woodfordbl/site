/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MetricBoard } from "@/components/settings/panels/analytics/metric-board.tsx";
import type { ContentTimelineDay } from "@/lib/pages/content-timeline.ts";
import type { ActivityDayDetail } from "@/lib/pages/page-activity-analytics.ts";
import type { PageCreationDay } from "@/lib/pages/page-lifecycle-analytics.ts";

/**
 * @fileoverview Coverage for the analytics board's delta + running-total pair.
 *
 * The interesting property is structural: each metric renders two plots (bars
 * and a total strip) rather than one dual-axis plot, and both scenes have to
 * compile from the same day list. Rendering with synthetic days asserts that,
 * and catches a channel/data mismatch that would only otherwise show up in a
 * workspace with enough history to populate the panel.
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

const PAGES: PageCreationDay[] = [
  { date: "Jun 1", dayKey: "2026-06-01", created: 2, cumulative: 2 },
  { date: "Jun 2", dayKey: "2026-06-02", created: 3, cumulative: 5 },
  { date: "Jun 3", dayKey: "2026-06-03", created: 0, cumulative: 5 },
];

const WORDS: ContentTimelineDay[] = [
  {
    date: "Jun 1",
    dayKey: "2026-06-01",
    wordsAdded: 120,
    cumulativeWords: 120,
  },
  {
    date: "Jun 2",
    dayKey: "2026-06-02",
    wordsAdded: 340,
    cumulativeWords: 460,
  },
];

const EDITS: ActivityDayDetail[] = [
  {
    activePages: 2,
    content: 4,
    date: "Jun 1",
    dayKey: "2026-06-01",
    lifecycle: 1,
    structure: 2,
    total: 7,
  },
  {
    activePages: 3,
    content: 6,
    date: "Jun 2",
    dayKey: "2026-06-02",
    lifecycle: 0,
    structure: 1,
    total: 7,
  },
];

/** Renders one metric with everything else empty. */
function renderMetric(metric: "edits" | "pages" | "words") {
  return render(
    <MetricBoard
      edits={metric === "edits" ? EDITS : []}
      hasSnapshots
      metric={metric}
      pages={metric === "pages" ? PAGES : []}
      storage={undefined}
      storageLoading={false}
      words={metric === "words" ? WORDS : []}
    />
  );
}

describe("MetricBoard", () => {
  it("draws the bars and the running total as separate plots", () => {
    const { container } = renderMetric("pages");
    expect(container.querySelectorAll("svg.ts-chart")).toHaveLength(2);
    // One bar per day, and the total as an area.
    expect(container.querySelectorAll(".ts-chart__bar rect")).toHaveLength(3);
    expect(container.querySelector(".ts-chart__area")).not.toBeNull();
  });

  it("names both series in the legend", () => {
    renderMetric("pages");
    expect(screen.getByText("Created")).toBeDefined();
    expect(screen.getByText("Total pages")).toBeDefined();
  });

  it("stacks the edit categories and strips out the active-pages line", () => {
    const { container } = renderMetric("edits");
    // Three categories × two days.
    expect(container.querySelectorAll(".ts-chart__bar rect")).toHaveLength(6);
    for (const label of [
      "Writing",
      "Structure",
      "Page changes",
      "Active pages",
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it("renders the words board from snapshot-derived days", () => {
    const { container } = renderMetric("words");
    expect(container.querySelectorAll("svg.ts-chart")).toHaveLength(2);
    expect(screen.getByText("Total words")).toBeDefined();
  });

  it("explains the empty state instead of drawing an empty plot", () => {
    render(
      <MetricBoard
        edits={[]}
        hasSnapshots
        metric="edits"
        pages={[]}
        storage={undefined}
        storageLoading={false}
        words={[]}
      />
    );
    expect(screen.getByText("No tracked edits in this period.")).toBeDefined();
  });
});
