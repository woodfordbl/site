import { z } from "zod";
import { HTTP_STATUS_NOT_FOUND } from "@/lib/connectors/http.ts";
import {
  type ConnectorDefinition,
  ConnectorError,
  type ConnectorFetchContext,
  type ConnectorFetchResult,
  type ConnectorFieldDef,
  type ConnectorRow,
} from "@/lib/connectors/types.ts";

/**
 * Frankfurter FX rates connector: one row per quote currency against a
 * configurable base, from the keyless open-CORS `frankfurter.dev` API
 * (proposal §4.1). ECB reference rates update once per business day, hence
 * the long poll policy.
 */

const frankfurterRatesConfigSchema = z.object({
  /** ISO 4217 base currency code; rates quote 1 unit of this. */
  base: z.string().min(1).default("USD"),
});

type FrankfurterRatesConfig = z.infer<typeof frankfurterRatesConfigSchema>;

const frankfurterResponseSchema = z.object({
  base: z.string(),
  /** Reference date (yyyy-mm-dd) the rates were published for. */
  date: z.string(),
  rates: z.record(z.string(), z.number()),
});

const FRANKFURTER_RATE_FIELDS: ConnectorFieldDef[] = [
  { sourceKey: "currency", name: "Currency", type: "text" },
  { sourceKey: "rate", name: "Rate", type: "number" },
  { sourceKey: "asOf", name: "As of", type: "date" },
];

const HOUR_MS = 3_600_000;
const SIX_HOURS_MS = 6 * HOUR_MS;

function parseConfig(config: Record<string, unknown>): FrankfurterRatesConfig {
  const parsed = frankfurterRatesConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new ConnectorError("Invalid Frankfurter connector config", {
      kind: "config",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  const { base } = parseConfig(ctx.config);
  const normalizedBase = base.trim().toUpperCase();
  const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(normalizedBase)}`;
  let response: Response;
  try {
    response = await ctx.fetchFn(url);
  } catch (cause) {
    throw new ConnectorError("Frankfurter request failed", {
      kind: "network",
      cause,
    });
  }
  if (response.status === HTTP_STATUS_NOT_FOUND) {
    throw new ConnectorError("Unknown base currency", { kind: "config" });
  }
  if (!response.ok) {
    throw new ConnectorError(
      `Frankfurter request failed (${response.status})`,
      { kind: "network" }
    );
  }
  const payload = frankfurterResponseSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new ConnectorError("Unexpected Frankfurter response shape", {
      kind: "network",
      cause: payload.error,
    });
  }
  const { date, rates } = payload.data;
  const rows: ConnectorRow[] = Object.entries(rates).map(
    ([currency, rate]) => ({
      externalId: currency,
      values: { currency, rate, asOf: date },
    })
  );
  return { kind: "rows", rows };
}

/** Frankfurter FX-rates connector definition. */
export const frankfurterRatesConnector: ConnectorDefinition<FrankfurterRatesConfig> =
  {
    id: "frankfurter-rates",
    title: "Exchange rates",
    description: "Daily reference exchange rates for a base currency.",
    icon: "tabler:IconExchange",
    configSchema: frankfurterRatesConfigSchema,
    configFields: [
      {
        key: "base",
        label: "Base currency",
        placeholder: "USD",
        kind: "text",
      },
    ],
    fields() {
      return FRANKFURTER_RATE_FIELDS;
    },
    primarySourceKey: "currency",
    fetchRows,
    pollPolicy: { minMs: HOUR_MS, defaultMs: SIX_HOURS_MS },
  };
