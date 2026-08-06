const MARKET_CAP_MILLIONS = 1_000_000;

/** Normalize Finnhub's optional company name. */
export function normalizeFinnhubCompanyName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim() || null;
}

/** Convert Finnhub's market-cap millions to absolute currency units. */
export function finnhubMarketCapFromMillions(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * MARKET_CAP_MILLIONS);
}
