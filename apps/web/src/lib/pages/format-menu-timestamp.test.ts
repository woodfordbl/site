import { describe, expect, it } from "vitest";

import { formatMenuTimestamp } from "@/lib/pages/format-menu-timestamp.ts";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const TODAY_PATTERN = /^Today at /;
// Local timezone shifts the day, so only assert the shape: "Mar 3, 2026, 3:00 PM".
const ABSOLUTE_PATTERN = /^\w{3} \d{1,2}, 2026, \d{1,2}:\d{2}/;

describe("formatMenuTimestamp", () => {
  it("shows a time-only label for today", () => {
    expect(
      formatMenuTimestamp(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)
    ).toMatch(TODAY_PATTERN);
  });

  it("shows month, day, year and time for other days", () => {
    expect(formatMenuTimestamp("2026-03-03T15:00:00.000Z", NOW)).toMatch(
      ABSOLUTE_PATTERN
    );
  });

  it("returns 'Unknown' for an unparseable input", () => {
    expect(formatMenuTimestamp("not-a-date", NOW)).toBe("Unknown");
  });
});
