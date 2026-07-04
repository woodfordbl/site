import { describe, expect, it } from "vitest";

import {
  computeRetryDelay,
  isSyncOverdue,
  MAX_BACKOFF_MS,
  resolveSyncInterval,
  resolveWatchedInterval,
} from "@/db/sync/sync-schedule.ts";

const policy = { defaultMs: 60_000, minMs: 10_000 };

describe("resolveSyncInterval", () => {
  it("uses the connector default when no override is set", () => {
    expect(resolveSyncInterval(undefined, policy)).toBe(60_000);
  });

  it("honors an override above the connector minimum", () => {
    expect(resolveSyncInterval(120_000, policy)).toBe(120_000);
  });

  it("clamps overrides below the connector minimum", () => {
    expect(resolveSyncInterval(1000, policy)).toBe(10_000);
  });

  it("clamps a connector default below its own minimum", () => {
    expect(
      resolveSyncInterval(undefined, { defaultMs: 5000, minMs: 10_000 })
    ).toBe(10_000);
  });
});

describe("resolveWatchedInterval", () => {
  it("keeps the resolved interval when unwatched", () => {
    expect(
      resolveWatchedInterval({
        intervalMs: 300_000,
        minMs: 60_000,
        watched: false,
      })
    ).toBe(300_000);
  });

  it("drops to the connector floor while watched", () => {
    expect(
      resolveWatchedInterval({
        intervalMs: 300_000,
        minMs: 60_000,
        watched: true,
      })
    ).toBe(60_000);
  });

  it("never slows an interval already at the floor", () => {
    expect(
      resolveWatchedInterval({
        intervalMs: 60_000,
        minMs: 60_000,
        watched: true,
      })
    ).toBe(60_000);
  });

  it("keeps an interval below the floor intact while watched", () => {
    expect(
      resolveWatchedInterval({
        intervalMs: 30_000,
        minMs: 60_000,
        watched: true,
      })
    ).toBe(30_000);
  });
});

describe("computeRetryDelay", () => {
  it("doubles the interval on the first failure", () => {
    expect(
      computeRetryDelay({ consecutiveFailures: 1, intervalMs: 60_000 })
    ).toBe(120_000);
  });

  it("grows exponentially with consecutive failures", () => {
    expect(
      computeRetryDelay({ consecutiveFailures: 3, intervalMs: 60_000 })
    ).toBe(480_000);
  });

  it("caps the backoff term at 30 minutes", () => {
    expect(
      computeRetryDelay({ consecutiveFailures: 10, intervalMs: 60_000 })
    ).toBe(MAX_BACKOFF_MS);
  });

  it("prefers retryAfterMs over the exponential term", () => {
    expect(
      computeRetryDelay({
        consecutiveFailures: 4,
        intervalMs: 60_000,
        retryAfterMs: 90_000,
      })
    ).toBe(90_000);
  });

  it("never retries sooner than the poll interval", () => {
    expect(
      computeRetryDelay({
        consecutiveFailures: 1,
        intervalMs: 60_000,
        retryAfterMs: 1000,
      })
    ).toBe(60_000);
  });

  it("lets an interval above the cap win over the capped backoff", () => {
    const twoHours = 2 * 60 * 60 * 1000;
    expect(
      computeRetryDelay({ consecutiveFailures: 2, intervalMs: twoHours })
    ).toBe(twoHours);
  });
});

describe("isSyncOverdue", () => {
  it("treats a never-attempted database as overdue", () => {
    expect(isSyncOverdue(undefined, 60_000, 1_000_000)).toBe(true);
  });

  it("is not overdue before the interval elapses", () => {
    expect(isSyncOverdue(1_000_000, 60_000, 1_030_000)).toBe(false);
  });

  it("is overdue once the interval has elapsed", () => {
    expect(isSyncOverdue(1_000_000, 60_000, 1_060_000)).toBe(true);
  });
});
