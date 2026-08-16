import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/lib/pages/format-relative-time.ts";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const MAR_PATTERN = /Mar/;

describe("formatRelativeTime", () => {
  it("shows 'just now' under a minute", () => {
    expect(formatRelativeTime(new Date(NOW - 5000).toISOString(), NOW)).toBe(
      "just now"
    );
  });

  it("shows minutes and hours ago", () => {
    expect(
      formatRelativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)
    ).toBe("5m ago");
    expect(
      formatRelativeTime(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)
    ).toBe("2h ago");
  });

  it("shows 'yesterday' for the prior calendar day", () => {
    expect(
      formatRelativeTime(new Date(NOW - 30 * 3_600_000).toISOString(), NOW)
    ).toBe("yesterday");
  });

  it("falls back to an absolute date for older timestamps", () => {
    const result = formatRelativeTime("2026-03-03T09:00:00.000Z", NOW);
    expect(result).toMatch(MAR_PATTERN);
  });

  it("returns 'unknown' for an unparseable input", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("unknown");
  });
});
