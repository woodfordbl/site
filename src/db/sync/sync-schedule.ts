/**
 * Pure scheduling arithmetic for the database sync engine — extracted so
 * interval clamping, failure backoff, and overdue detection are unit-testable
 * without timers or DOM.
 */

export interface ConnectorPollPolicy {
  /** Interval used when the database sets no `refreshMs` override. */
  defaultMs: number;
  /** Hard floor a connector imposes on its poll interval. */
  minMs: number;
}

/** Failed databases never wait longer than this between attempts. */
export const MAX_BACKOFF_MS = 30 * 60 * 1000;

/** Effective poll interval: the database's `refreshMs` override (or the
 * connector default) clamped to the connector's minimum. */
export function resolveSyncInterval(
  refreshMs: number | undefined,
  policy: ConnectorPollPolicy
): number {
  return Math.max(policy.minMs, refreshMs ?? policy.defaultMs);
}

export interface RetryDelayOptions {
  /** Failures since the last success, counting the one just recorded (≥ 1). */
  consecutiveFailures: number;
  /** Effective poll interval (see {@link resolveSyncInterval}). */
  intervalMs: number;
  /** Server-provided wait (e.g. 429 Retry-After), taking precedence over the
   * exponential term. */
  retryAfterMs?: number;
}

/**
 * Delay until the next attempt after a failure:
 * `max(interval, min(retryAfterMs ?? interval * 2^failures, 30min))`.
 * The cap bounds the backoff term only — an interval above 30 minutes is a
 * deliberate cadence choice and still wins.
 */
export function computeRetryDelay(options: RetryDelayOptions): number {
  const backoff =
    options.retryAfterMs ??
    options.intervalMs * 2 ** Math.max(1, options.consecutiveFailures);
  return Math.max(options.intervalMs, Math.min(backoff, MAX_BACKOFF_MS));
}

/** Whether a database is due for a run (never attempted counts as overdue). */
export function isSyncOverdue(
  lastAttemptAt: number | undefined,
  intervalMs: number,
  now: number
): boolean {
  return lastAttemptAt === undefined || now - lastAttemptAt >= intervalMs;
}
