/**
 * Tiny shared HTTP helpers for connector `fetchRows` implementations: status
 * constants and rate-limit retry-delay extraction. Pure functions only.
 */

export const HTTP_STATUS_NOT_MODIFIED = 304;
export const HTTP_STATUS_UNAUTHORIZED = 401;
export const HTTP_STATUS_FORBIDDEN = 403;
export const HTTP_STATUS_NOT_FOUND = 404;
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;

const MS_PER_SECOND = 1000;

/**
 * Retry delay in ms from a `Retry-After` header (delta-seconds form only —
 * the HTTP-date form is rare on APIs and not worth the parse). Returns
 * `undefined` when absent or non-numeric.
 */
export function retryAfterMsFromHeaders(headers: Headers): number | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter === null) {
    return;
  }
  const seconds = Number(retryAfter);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return;
  }
  return seconds * MS_PER_SECOND;
}

/**
 * Retry delay in ms from an `X-RateLimit-Reset` header (unix epoch seconds,
 * GitHub-style), relative to now. Clamped to ≥ 0; `undefined` when absent or
 * non-numeric.
 */
export function rateLimitResetMsFromHeaders(
  headers: Headers
): number | undefined {
  const reset = headers.get("x-ratelimit-reset");
  if (reset === null) {
    return;
  }
  const epochSeconds = Number(reset);
  if (!Number.isFinite(epochSeconds)) {
    return;
  }
  return Math.max(0, epochSeconds * MS_PER_SECOND - Date.now());
}
