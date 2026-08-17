import { describe, expect, it } from "vitest";

import {
  clipToWindow,
  DEFAULT_TIME_WINDOW_MS,
  isDayWindow,
  presetForWindow,
  resolutionForWindow,
  windowDisplayRange,
  windowFetchRange,
} from "@/lib/databases/time-series-chart-data.ts";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Local midnight of the day containing `t` — the day window's left edge. */
function midnight(t: number): number {
  const date = new Date(t);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

describe("presetForWindow / resolutionForWindow", () => {
  it("maps standard windows to their expected resolution", () => {
    expect(resolutionForWindow(DAY_MS)).toBe("5m");
    expect(resolutionForWindow(7 * DAY_MS)).toBe("1h");
    expect(resolutionForWindow(30 * DAY_MS)).toBe("4h");
    expect(resolutionForWindow(365 * DAY_MS)).toBe("1d");
  });

  it("snaps an odd window to the nearest preset", () => {
    expect(presetForWindow(6 * DAY_MS).id).toBe("7D");
    expect(presetForWindow(DEFAULT_TIME_WINDOW_MS).id).toBe("7D");
  });

  it("resolves a window shorter than any preset to the day", () => {
    // Views saved against the retired 15-minute "Live" window land here.
    expect(presetForWindow(15 * MINUTE_MS).id).toBe("1D");
    expect(isDayWindow(15 * MINUTE_MS)).toBe(true);
  });
});

describe("windowFetchRange", () => {
  const now = new Date(2026, 5, 3, 14, 37).getTime();

  it("is a plain lookback for every window but the day", () => {
    expect(windowFetchRange(7 * DAY_MS, now)).toEqual({
      from: now - 7 * DAY_MS,
      to: now,
    });
  });

  it("reaches back past today so the day window has a session to fall back to", () => {
    const range = windowFetchRange(DAY_MS, now);
    expect(range.to).toBe(now);
    expect(range.from).toBe(midnight(now) - 5 * DAY_MS);
  });
});

describe("windowDisplayRange", () => {
  const now = new Date(2026, 5, 3, 14, 37).getTime();
  const today = midnight(now);

  it("shows the calendar day so far, not a 24-hour lookback", () => {
    const timestamps = [today - 3 * HOUR_MS, today + HOUR_MS, now - MINUTE_MS];
    expect(windowDisplayRange(DAY_MS, timestamps, now)).toEqual({
      from: today,
      to: now,
    });
  });

  it("falls back to the last session when today has no observations", () => {
    // Two prior trading days, seven hourly samples each, then nothing today.
    const session = (dayOffset: number) =>
      Array.from(
        { length: 7 },
        (_unused, index) =>
          today - dayOffset * DAY_MS + 9 * HOUR_MS + index * HOUR_MS
      );
    const timestamps = [...session(2), ...session(1)];
    const range = windowDisplayRange(DAY_MS, timestamps, now);
    // The most recent session's own opening sample, not midnight and not the
    // earlier day.
    expect(range.from).toBe(today - DAY_MS + 9 * HOUR_MS);
    expect(range.to).toBe(now);
  });

  it("still starts at midnight when there is nothing to fall back to", () => {
    expect(windowDisplayRange(DAY_MS, [], now)).toEqual({
      from: today,
      to: now,
    });
  });

  it("ignores the covered timestamps for a lookback window", () => {
    expect(windowDisplayRange(30 * DAY_MS, [today], now)).toEqual({
      from: now - 30 * DAY_MS,
      to: now,
    });
  });
});

describe("clipToWindow", () => {
  it("keeps only points inside [from, to]", () => {
    const points = [
      { t: 10, v: 1 },
      { t: 20, v: 2 },
      { t: 30, v: 3 },
    ];
    expect(clipToWindow(points, 15, 30)).toEqual([
      { t: 20, v: 2 },
      { t: 30, v: 3 },
    ]);
  });
});
