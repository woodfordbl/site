import type { z } from "zod";
import type {
  DatabaseCellValue,
  DatabaseFieldType,
  DatabaseNumberFormat,
  DatabaseSelectOption,
} from "@/lib/schemas/database.ts";

/**
 * Connector SDK contract (pure TypeScript, React-free). A connector describes
 * one external data source that the client-side sync engine can poll into a
 * synced database: its parsed config shape, the canonical field schema it
 * produces, and a `fetchRows` that returns a **complete snapshot** of rows —
 * the TanStack DB query collection diffs snapshots into insert/update/delete
 * deltas keyed by `externalId`, so connectors never hand-diff. See
 * docs/proposals/notion-style-databases.md §4.
 */

/**
 * One synced column as declared by a connector. `sourceKey` is the stable
 * provider-side key that row `values` are keyed by; the seed builder maps it
 * onto a generated `DatabaseField` (which carries `sourceKey` so the sync
 * diff can tell synced columns from user-added local ones).
 */
export interface ConnectorFieldDef {
  /**
   * When true (numeric fields only), the seed builder tags the generated field
   * with `captureHistory`, so the sync engine records each changed value into
   * the forward-only field-history series that time-axis charts read.
   */
  captureHistory?: boolean;
  /** Display name for the generated database field. */
  name: string;
  /** Number display format; only meaningful when `type` is `"number"`. */
  numberFormat?: DatabaseNumberFormat;
  /**
   * Static option set; only meaningful when `type` is `"select"` or
   * `"multiSelect"`. Row values must store OPTION IDS. Options are fixed at
   * declaration time — the sync engine only writes row values, never schema,
   * so select columns are only safe for closed sets known up front.
   */
  options?: DatabaseSelectOption[];
  /** Stable provider-side key; `ConnectorRow.values` is keyed by this. */
  sourceKey: string;
  /** Database field type the synced values conform to. */
  type: DatabaseFieldType;
}

/**
 * Everything a connector needs for one fetch. `fetchFn` is always injected
 * (the scheduler passes real `fetch`; tests pass a fake) so connectors stay
 * unit-testable without network access.
 */
export interface ConnectorFetchContext {
  /** Raw connector config from `DatabaseSource`; connectors re-validate it. */
  config: Record<string, unknown>;
  /** ETag from the previous snapshot, for `If-None-Match` conditional GETs. */
  etag?: string;
  /** Injected fetch implementation — never call global `fetch` directly. */
  fetchFn: typeof fetch;
  /** User-supplied token from the token store, when the connector has auth. */
  token?: string;
}

/** One synced row: provider identity plus values keyed by `sourceKey`. */
export interface ConnectorRow {
  /** Stable provider-side row identity (`LocalDatabaseRow.externalId`). */
  externalId: string;
  /** Cell values keyed by field `sourceKey`; `null`/missing = empty. */
  values: Record<string, DatabaseCellValue>;
}

/**
 * Result of one poll: either a full row snapshot (with the response ETag to
 * persist for the next conditional request) or `notModified` when the
 * provider answered 304 — nothing to apply, current rows stay as-is.
 */
export type ConnectorFetchResult =
  | {
      kind: "rows";
      rows: ConnectorRow[];
      /** ETag to send as `If-None-Match` on the next poll, when supported. */
      etag?: string;
    }
  | { kind: "notModified" };

/**
 * Handlers the sync engine passes to a streaming connector. `onRows` delivers
 * keyed upserts (same `ConnectorRow` shape as `fetchRows`) as ticks arrive —
 * the engine coalesces and applies them by `externalId`. `onError` surfaces a
 * `ConnectorError` (e.g. the socket dropped) for status/reconnect handling.
 */
export interface ConnectorStreamHandlers {
  onError(err: ConnectorError): void;
  onRows(rows: ConnectorRow[]): void;
}

/**
 * Optional live-streaming capability on a connector. `subscribe` opens a
 * real-time subscription (a WebSocket, directly to the provider for keyless
 * feeds or to a same-origin proxy for keyed ones) and returns an unsubscribe
 * that tears it down. The engine only subscribes while a view is watched in
 * the visible leader tab; `fetchRows` still provides the initial snapshot
 * seed and the unwatched-refresh fallback. Reconnect/backoff is the engine's
 * job — `subscribe` should surface a drop via `onError` and return.
 */
export interface ConnectorStream {
  subscribe(
    ctx: ConnectorFetchContext,
    handlers: ConnectorStreamHandlers
  ): () => void;
}

/**
 * Canonical candle resolutions a `fetchHistory` request can ask for. The
 * time-series chart picks one from the visible window (finer for short windows,
 * coarser for long ones); each connector maps these onto its provider's own
 * interval names.
 */
export type HistoryResolution = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

/** One historical-backfill request for a single row/symbol over a time range. */
export interface ConnectorHistoryRequest {
  /** Row identity to fetch history for (same as `ConnectorRow.externalId`). */
  externalId: string;
  /** Inclusive range start, epoch milliseconds. */
  from: number;
  /** Requested candle resolution. */
  resolution: HistoryResolution;
  /** Inclusive range end, epoch milliseconds. */
  to: number;
}

/** One historical sample: `t` = epoch milliseconds, `v` = value (close price). */
export interface ConnectorHistoryPoint {
  t: number;
  v: number;
}

/** One input in the synced-database creation form, mapped to a config key. */
export interface ConnectorConfigField {
  /** Config object key this input writes. */
  key: string;
  /** `"text"` = single string; `"list"` = comma/newline-separated string[]. */
  kind: "text" | "list";
  /** Input label. */
  label: string;
  /** Placeholder / example value. */
  placeholder?: string;
}

/**
 * BYO-token auth declaration. Tokens are entered by the user and stored
 * client-side only (see `token-store.ts`) — never bundled, never sent to our
 * server.
 */
export interface ConnectorAuthSpec {
  /** Scope guidance shown next to the input. */
  help: string;
  kind: "token";
  /** Input label (e.g. "Personal access token"). */
  label: string;
  /** Whether the connector works at all without a token. */
  required: boolean;
}

/** Poll cadence bounds; `refreshMs` overrides clamp to `minMs`. */
export interface ConnectorPollPolicy {
  /** Interval used when the database has no `refreshMs` override. */
  defaultMs: number;
  /** Hard floor for the poll interval in ms. */
  minMs: number;
}

/**
 * A complete connector definition. `TConfig` is the parsed config shape
 * produced by `configSchema`; the default keeps heterogeneous registries
 * (`Record<string, ConnectorDefinition>`) assignable.
 */
export interface ConnectorDefinition<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Optional BYO-token auth; absent = keyless connector. */
  auth?: ConnectorAuthSpec;
  /** Form inputs that collect the config at creation time. */
  configFields: ConnectorConfigField[];
  /** Zod v4 schema validating/parsing the raw config record. */
  configSchema: z.ZodType<TConfig>;
  /** One-line description for the connector picker. */
  description: string;
  /**
   * Optional historical backfill for the connector's `captureHistory` value
   * (e.g. price) over a time range. Present = time-axis charts can draw a
   * "last 7 days" window before local capture exists, stitching provider
   * candles (older) under the forward-only local series (finer, recent).
   * Returns points ascending by `t`; transport-resolved like `fetchRows`.
   */
  fetchHistory?(
    ctx: ConnectorFetchContext,
    request: ConnectorHistoryRequest
  ): Promise<ConnectorHistoryPoint[]>;
  /**
   * Fetch one complete row snapshot. Throws `ConnectorError` on failure;
   * returns `notModified` on a 304 conditional hit.
   */
  fetchRows(ctx: ConnectorFetchContext): Promise<ConnectorFetchResult>;
  /** Canonical synced field schema for a given parsed config. */
  fields(config: TConfig): ConnectorFieldDef[];
  /** Glyph in page-icon format (`tabler:IconName`). */
  icon: string;
  /** Stable id referenced by `DatabaseSource.connectorId`. */
  id: string;
  /** Poll cadence bounds for the sync scheduler. */
  pollPolicy: ConnectorPollPolicy;
  /** `sourceKey` of the title-like field (becomes `primaryFieldId`). */
  primarySourceKey: string;
  /**
   * Optional live-streaming capability. Present = the engine opens a real-time
   * subscription (via {@link ConnectorStream.subscribe}) while the database is
   * watched in the visible leader tab, applying ticks on top of the `fetchRows`
   * seed. Absent = poll-only (the existing behavior).
   */
  stream?: ConnectorStream;
  /** Display title (also the default synced-database name). */
  title: string;
}

/**
 * Failure taxonomy the scheduler acts on: `auth` surfaces a re-enter-token
 * state, `rateLimit` backs off (honoring `retryAfterMs`), `config` stops
 * polling until the user edits the source, `network` retries with backoff.
 */
export type ConnectorErrorKind = "auth" | "rateLimit" | "network" | "config";

/** Options bag for {@link ConnectorError}. */
export interface ConnectorErrorOptions {
  /** Underlying error, forwarded as `Error.cause`. */
  cause?: unknown;
  /** Failure category; defaults to `"network"`. */
  kind?: ConnectorErrorKind;
  /** Provider-suggested wait before retrying (from `Retry-After` etc.). */
  retryAfterMs?: number;
}

/**
 * The only error type `fetchRows` is allowed to throw. Carries the failure
 * kind plus an optional provider-suggested retry delay so the scheduler can
 * back off precisely instead of guessing.
 */
export class ConnectorError extends Error {
  /** Failure category driving scheduler behavior. */
  readonly kind: ConnectorErrorKind;
  /** Provider-suggested wait in ms before the next attempt, when known. */
  readonly retryAfterMs?: number;

  constructor(message: string, opts: ConnectorErrorOptions = {}) {
    super(
      message,
      opts.cause === undefined ? undefined : { cause: opts.cause }
    );
    this.name = "ConnectorError";
    this.kind = opts.kind ?? "network";
    this.retryAfterMs = opts.retryAfterMs;
  }
}
