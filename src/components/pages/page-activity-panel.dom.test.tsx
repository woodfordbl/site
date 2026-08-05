/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageActivityPanel } from "@/components/pages/page-activity-panel.tsx";

const AUTHOR_NAME =
  "An intentionally long author name that needs to truncate within the menu";

vi.mock("@/db/queries/use-page-blocks.ts", () => ({
  usePageBlocks: () => ({ blocks: [], liveLocalBlocks: [] }),
}));

vi.mock("@/hooks/use-local-pages.ts", () => ({
  useLocalPageById: () => null,
}));

vi.mock("@/hooks/use-page-list.ts", () => ({
  usePageListItems: () => ({ pages: [] }),
}));

vi.mock("@/lib/pages/page-activity-summary.ts", () => ({
  buildPageActivitySummary: () => ({
    createdAt: "2026-07-30T15:45:00.000Z",
    lastEditedAt: "2026-07-31T16:20:00.000Z",
  }),
}));

vi.mock("@/lib/site/site-author.ts", () => ({
  SITE_AUTHOR_NAME:
    "An intentionally long author name that needs to truncate within the menu",
}));

afterEach(cleanup);

describe("PageActivityPanel", () => {
  it("keeps every activity row on one line and truncates long values", () => {
    const { container } = render(<PageActivityPanel pageId="page-1" />);
    const rows = container.querySelectorAll('[data-slot="page-activity-row"]');
    const labels = container.querySelectorAll(
      '[data-slot="page-activity-label"]'
    );
    const values = container.querySelectorAll(
      '[data-slot="page-activity-value"]'
    );

    expect(rows).toHaveLength(3);
    expect(labels).toHaveLength(3);
    expect(values).toHaveLength(3);

    for (const row of rows) {
      expect(row.className).toContain("min-w-0");
      expect(row.className).toContain("whitespace-nowrap");
    }

    for (const label of labels) {
      expect(label.className).toContain("shrink-0");
      expect(label.className).toContain("whitespace-nowrap");
    }

    for (const value of values) {
      expect(value.className).toContain("min-w-0");
      expect(value.className).toContain("flex-1");
      expect(value.className).toContain("truncate");
      expect(value.getAttribute("title")).toBe(value.textContent);
    }

    expect(values[2]?.textContent).toBe(AUTHOR_NAME);
    expect(values[2]?.getAttribute("title")).toBe(AUTHOR_NAME);
  });
});
