import {
  CHART_PALETTE_IDS,
  type ChartPaletteId,
} from "@/lib/charts/chart-palettes.ts";
import { formatCellValue } from "@/lib/databases/cell-values.ts";
import { computeAggregate } from "@/lib/databases/row-aggregate.ts";
import {
  groupKeyForRow,
  groupRowsForView,
  isGroupableField,
} from "@/lib/databases/row-group.ts";
import {
  DATABASE_CHART_Y_AGGREGATES,
  type DatabaseField,
  type DatabaseTableViewConfig,
  type DatabaseView,
  type LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Pure chart-view data transform: bucket already-filtered/sorted/formula-
 * merged rows by the X field, aggregate each bucket (count, or a numeric
 * reducer over the Y field), and optionally split into one series per
 * series-field value. Bucketing and ordering reuse `row-group.ts` exactly
 * (select option order, dates ascending by ISO key, collated text, empty
 * bucket LAST as "No <field>"), so charts always agree with grouped tables.
 */

export type DatabaseChartConfig = NonNullable<DatabaseTableViewConfig["chart"]>;

export type DatabaseChartMark = NonNullable<DatabaseChartConfig["mark"]>;

export type DatabaseChartYAggregate = NonNullable<
  DatabaseChartConfig["yAggregate"]
>;

export const DEFAULT_CHART_MARK: DatabaseChartMark = "bar";

export const DEFAULT_CHART_Y_AGGREGATE: DatabaseChartYAggregate = "count";

/** Y aggregate menu order (the schema enum is the single source). */
export const CHART_Y_AGGREGATES: readonly DatabaseChartYAggregate[] =
  DATABASE_CHART_Y_AGGREGATES;

export const CHART_Y_AGGREGATE_LABELS: Record<DatabaseChartYAggregate, string> =
  {
    count: "Count",
    sum: "Sum",
    average: "Average",
    min: "Min",
    max: "Max",
  };

/** Number of `--chart-N` color tokens a palette provides. */
export const CHART_COLOR_TOKEN_COUNT = 5;

/** Series key used when no series field splits the chart. */
export const CHART_SINGLE_SERIES_KEY = "value";

/** One chart series: a value per category, in category order. */
export interface ChartDataSeries {
  /** Chart token index 1-5 from `colorOverrides`; absent = cycle by position. */
  color?: number;
  /**
   * Stable series key — the series field's bucket key (`groupKeyForRow`), or
   * `CHART_SINGLE_SERIES_KEY` for the unsplit series. `colorOverrides` keys
   * on this.
   */
  key: string;
  /** Display label (option name / formatted value / "No <field>"). */
  label: string;
  /**
   * One point per category. Empty buckets are `null` for line/area marks
   * (rendered as gaps) and `0` for bar/pie marks.
   */
  points: (number | null)[];
}

export interface ChartData {
  /** Category display labels, in bucket order (empty bucket last). */
  categories: string[];
  /**
   * Stable bucket keys aligned with `categories` — pie per-slice
   * `colorOverrides` key on these.
   */
  categoryKeys: string[];
  series: ChartDataSeries[];
}

const EMPTY_CHART_DATA: ChartData = {
  categories: [],
  categoryKeys: [],
  series: [],
};

/** Fields that can drive the X axis or the series split (same as group-by). */
export function chartXFieldCandidates(
  fields: readonly DatabaseField[]
): DatabaseField[] {
  return fields.filter(isGroupableField);
}

/**
 * Fields that can back a numeric Y aggregate: number fields, plus formula
 * fields (which aggregate over their number-typed computed values, matching
 * `computeAggregate`).
 */
export function chartYFieldCandidates(
  fields: readonly DatabaseField[]
): DatabaseField[] {
  return fields.filter(
    (field) => field.type === "number" || field.type === "formula"
  );
}

/** The chart's X field, or `null` when unset, stale, or not groupable. */
export function resolveChartXField(
  fields: readonly DatabaseField[],
  chart: DatabaseChartConfig
): DatabaseField | null {
  if (chart.xFieldId === undefined) {
    return null;
  }
  const field = fields.find((entry) => entry.id === chart.xFieldId);
  return field && isGroupableField(field) ? field : null;
}

/**
 * The chart's Y field for non-count aggregates, or `null` when the aggregate
 * is count, the id is unset/stale, or the field isn't numeric-capable.
 */
export function resolveChartYField(
  fields: readonly DatabaseField[],
  chart: DatabaseChartConfig
): DatabaseField | null {
  const aggregate = chart.yAggregate ?? DEFAULT_CHART_Y_AGGREGATE;
  if (aggregate === "count" || chart.yFieldId === undefined) {
    return null;
  }
  const field = fields.find((entry) => entry.id === chart.yFieldId);
  return field && (field.type === "number" || field.type === "formula")
    ? field
    : null;
}

/** The chart's series-split field, or `null` when unset/stale/not groupable. */
export function resolveChartSeriesField(
  fields: readonly DatabaseField[],
  chart: DatabaseChartConfig
): DatabaseField | null {
  if (chart.seriesFieldId === undefined) {
    return null;
  }
  const field = fields.find((entry) => entry.id === chart.seriesFieldId);
  return field && isGroupableField(field) ? field : null;
}

/** A stored palette id validated against the site palette list. */
export function resolveChartPaletteId(
  palette: string | undefined
): ChartPaletteId | undefined {
  return (CHART_PALETTE_IDS as readonly string[]).includes(palette ?? "")
    ? (palette as ChartPaletteId)
    : undefined;
}

/**
 * A series/slice color override validated to a chart token index (integer
 * 1-5); anything else reads as "no override".
 */
export function chartColorOverride(
  chart: DatabaseChartConfig,
  key: string
): number | undefined {
  const raw = chart.colorOverrides?.[key];
  return typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 1 &&
    raw <= CHART_COLOR_TOKEN_COUNT
    ? raw
    : undefined;
}

/**
 * Effective `--chart-N` token index for a series/slice at `position`:
 * its validated override, else cycling 1→5 by position.
 */
export function chartTokenIndex(
  color: number | undefined,
  position: number
): number {
  return color ?? (position % CHART_COLOR_TOKEN_COUNT) + 1;
}

/** Display label for the unsplit series ("Count", "Sum of Price", …). */
export function chartValueLabel(
  aggregate: DatabaseChartYAggregate,
  yField: DatabaseField | null
): string {
  if (aggregate === "count" || yField === null) {
    return CHART_Y_AGGREGATE_LABELS.count;
  }
  return `${CHART_Y_AGGREGATE_LABELS[aggregate]} of ${yField.name}`;
}

const PLAIN_NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

/**
 * Display formatting for a Y value (tooltips, axis ticks): non-count
 * aggregates over a number field render via the field's full display config
 * (`formatCellValue` — format/decimals/grouping), everything else (counts,
 * formula aggregates) as a plain grouped en-US number.
 */
export function formatChartYValue(
  aggregate: DatabaseChartYAggregate,
  yField: DatabaseField | null,
  value: number
): string {
  if (aggregate !== "count" && yField?.type === "number") {
    return formatCellValue(yField, value);
  }
  return PLAIN_NUMBER_FORMATTER.format(value);
}

/**
 * Bucket rows by one field with `row-group.ts` semantics via a synthetic
 * grouped view — single source of truth for bucket keys, labels, and order.
 */
function bucketRowsByField(
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  fieldId: string
) {
  const syntheticView: DatabaseView = {
    id: "chart-buckets",
    name: "",
    type: "table",
    groupBy: { fieldId },
    config: {},
  };
  return groupRowsForView(rows, fields, syntheticView);
}

/**
 * Build the chart-view dataset for one view's `config.chart`. Deterministic
 * and pure: categories come from X-field buckets in group order; each series
 * holds one aggregated point per category. Returns the empty dataset when
 * the X field is unresolved or a non-count aggregate lacks a usable Y field
 * (the component renders guidance for those states).
 */
export function buildChartData(
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  chart: DatabaseChartConfig
): ChartData {
  const mark = chart.mark ?? DEFAULT_CHART_MARK;
  const aggregate = chart.yAggregate ?? DEFAULT_CHART_Y_AGGREGATE;
  const xField = resolveChartXField(fields, chart);
  if (!xField) {
    return EMPTY_CHART_DATA;
  }
  const yField = resolveChartYField(fields, chart);
  if (aggregate !== "count" && !yField) {
    return EMPTY_CHART_DATA;
  }

  const xBuckets = bucketRowsByField(fields, rows, xField.id);
  const categories = xBuckets.map((bucket) => bucket.label);
  const categoryKeys = xBuckets.map((bucket) => bucket.key);
  // Line/area render empty buckets as gaps; bars and pie slices sit at 0.
  const emptyPoint = mark === "line" || mark === "area" ? null : 0;

  const valueFor = (bucketRows: readonly LocalDatabaseRow[]): number | null => {
    if (bucketRows.length === 0) {
      return emptyPoint;
    }
    if (aggregate === "count") {
      return bucketRows.length;
    }
    // Empty-cell skipping is computeAggregate's contract: numeric reducers
    // only see number-typed cells (sum of none = 0, average/min/max = null).
    const result = yField
      ? computeAggregate(aggregate, yField, bucketRows)
      : null;
    return typeof result === "number" ? result : emptyPoint;
  };

  // Pie is always a single series over categories — the series split is a
  // cartesian-mark concept.
  const seriesField =
    mark === "pie" ? null : resolveChartSeriesField(fields, chart);

  if (!seriesField) {
    return {
      categories,
      categoryKeys,
      series: [
        {
          key: CHART_SINGLE_SERIES_KEY,
          label: chartValueLabel(aggregate, yField),
          color: chartColorOverride(chart, CHART_SINGLE_SERIES_KEY),
          points: xBuckets.map((bucket) => valueFor(bucket.rows)),
        },
      ],
    };
  }

  // Series identity and order from the same grouping semantics over ALL rows
  // (select option order, stale ids after, empty series last).
  const seriesBuckets = bucketRowsByField(fields, rows, seriesField.id);
  const series: ChartDataSeries[] = seriesBuckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    color: chartColorOverride(chart, bucket.key),
    points: [],
  }));

  for (const bucket of xBuckets) {
    const partitions = new Map<string, LocalDatabaseRow[]>();
    for (const row of bucket.rows) {
      const key = groupKeyForRow(seriesField, row.values[seriesField.id]);
      const existing = partitions.get(key);
      if (existing) {
        existing.push(row);
      } else {
        partitions.set(key, [row]);
      }
    }
    for (const entry of series) {
      entry.points.push(valueFor(partitions.get(entry.key) ?? []));
    }
  }

  return { categories, categoryKeys, series };
}
