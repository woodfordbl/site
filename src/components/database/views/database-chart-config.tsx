import {
  IconChartArea,
  IconChartBar,
  IconChartLine,
  IconChartPie,
} from "@tabler/icons-react";
import type { ComponentType, ReactNode } from "react";

import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import {
  chartConfigPatch,
  cycledColorOverrides,
} from "@/components/database/views/database-chart-config-helpers.ts";
import { ChartPaletteScope } from "@/components/ui/chart.tsx";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
} from "@/components/ui/dropdown-menu.tsx";
import { updateDatabaseView } from "@/db/queries/database-collection-ops.ts";
import {
  CHART_PALETTE_IDS,
  CHART_PALETTE_TOKENS,
  CHART_PALETTES,
  type ChartPaletteId,
} from "@/lib/charts/chart-palettes.ts";
import {
  CHART_Y_AGGREGATE_LABELS,
  CHART_Y_AGGREGATES,
  type ChartData,
  type DatabaseChartConfig as ChartViewConfig,
  chartColorOverride,
  chartTokenIndex,
  chartXFieldCandidates,
  chartYFieldCandidates,
  type DatabaseChartMark,
  DEFAULT_CHART_MARK,
  DEFAULT_CHART_Y_AGGREGATE,
  resolveChartPaletteId,
} from "@/lib/databases/chart-data.ts";
import {
  DEFAULT_TIME_WINDOW_MS,
  presetForWindow,
  TIME_WINDOW_PRESETS,
} from "@/lib/databases/time-series-chart-data.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabase,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Chart settings menu items (mark, X/Y/series fields, legend, stacking, grid,
 * palette, per-series color overrides), rendered inside the database ⋯
 * settings menu's "Chart" submenu — NOT a floating gear, so every view's
 * options live in one place. Every write shallow-merges through
 * `chartConfigPatch` → `updateDatabaseView`, following the settings-menu patch
 * conventions.
 */

const MARK_OPTIONS: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: DatabaseChartMark;
}[] = [
  { value: "bar", label: "Bar", icon: IconChartBar },
  { value: "line", label: "Line", icon: IconChartLine },
  { value: "area", label: "Area", icon: IconChartArea },
  { value: "pie", label: "Pie", icon: IconChartPie },
];

/** Radio value for "no selection" slots (series None, palette Default). */
const NONE_VALUE = "__none";

interface RadioSubmenuOption {
  label: string;
  leading?: ReactNode;
  value: string;
}

interface RadioSubmenuProps {
  currentLabel: string;
  label: string;
  onValueChange: (value: string) => void;
  options: RadioSubmenuOption[];
  value: string;
}

/** Submenu picker row: label + current value, radio list inside. */
function RadioSubmenu({
  currentLabel,
  label,
  onValueChange,
  options,
  value,
}: RadioSubmenuProps): ReactNode {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="shrink-0">{label}</span>
        <span className="ml-auto min-w-0 truncate pl-3 text-muted-foreground text-xs">
          {currentLabel}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup onValueChange={onValueChange} value={value}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.leading}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Live five-dot preview of a palette (same idiom as Settings → Appearance). */
function PaletteSwatch({ palette }: { palette: ChartPaletteId }): ReactNode {
  return (
    <span className="flex items-center gap-1" data-chart-palette={palette}>
      {CHART_PALETTE_TOKENS.map((token) => (
        <span
          className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10"
          key={token}
          style={{ backgroundColor: `var(--${token})` }}
        />
      ))}
    </span>
  );
}

/** Grid-line count choices (horizontal gridlines / Y ticks); "auto" clears. */
const GRID_COUNT_OPTIONS: RadioSubmenuOption[] = [
  { value: "auto", label: "Auto" },
  ...["3", "4", "5", "6", "8", "10", "12"].map((n) => ({
    value: n,
    label: n,
  })),
];

/** Field picker option with the field's (custom or type) icon. */
function fieldOption(field: DatabaseField): RadioSubmenuOption {
  const FieldIcon = resolveFieldIcon(field);
  return {
    value: field.id,
    label: field.name,
    leading: <FieldIcon className="size-4 shrink-0 stroke-[1.5px]" />,
  };
}

const LEGEND_POSITION_LABELS = {
  top: "Top",
  bottom: "Bottom",
  right: "Right",
} as const;

type LegendPosition = keyof typeof LEGEND_POSITION_LABELS;

const LEGEND_POSITIONS: LegendPosition[] = ["top", "bottom", "right"];

type WriteChartPatch = (patch: Partial<ChartViewConfig>) => void;

/** Segmented mark control (bar / line / area / pie), embedded in the menu. */
function MarkPicker({
  mark,
  write,
}: {
  mark: DatabaseChartMark;
  write: WriteChartPatch;
}): ReactNode {
  return (
    <fieldset
      aria-label="Chart type"
      className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1"
    >
      {MARK_OPTIONS.map((option) => (
        <button
          aria-label={`${option.label} chart`}
          aria-pressed={mark === option.value}
          className={cn(
            "flex h-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            mark === option.value && "bg-background text-foreground shadow-xs"
          )}
          key={option.value}
          onClick={() => {
            write({ mark: option.value });
          }}
          title={option.label}
          type="button"
        >
          <option.icon className="size-4 stroke-[1.5px]" />
        </button>
      ))}
    </fieldset>
  );
}

/** Legend switch + position, stacked (bar/area), and grid (cartesian) rows. */
function ChartToggleItems({
  chart,
  mark,
  showLegend,
  write,
}: {
  chart: ChartViewConfig;
  mark: DatabaseChartMark;
  showLegend: boolean;
  write: WriteChartPatch;
}): ReactNode {
  return (
    <>
      <DropdownMenuSwitchItem
        checked={showLegend}
        onCheckedChange={(next) => {
          write({ showLegend: next });
        }}
      >
        Legend
      </DropdownMenuSwitchItem>
      {showLegend ? (
        <RadioSubmenu
          currentLabel={
            LEGEND_POSITION_LABELS[chart.legendPosition ?? "bottom"]
          }
          label="Legend position"
          onValueChange={(value) => {
            write({
              legendPosition: value as ChartViewConfig["legendPosition"],
            });
          }}
          options={LEGEND_POSITIONS.map((value) => ({
            value,
            label: LEGEND_POSITION_LABELS[value],
          }))}
          value={chart.legendPosition ?? "bottom"}
        />
      ) : null}
      {mark === "bar" || mark === "area" ? (
        <DropdownMenuSwitchItem
          checked={chart.stacked === true}
          onCheckedChange={(next) => {
            write({ stacked: next });
          }}
        >
          Stacked
        </DropdownMenuSwitchItem>
      ) : null}
      {mark === "pie" ? null : (
        <DropdownMenuSwitchItem
          checked={chart.showGrid !== false}
          onCheckedChange={(next) => {
            write({ showGrid: next });
          }}
        >
          Grid lines
        </DropdownMenuSwitchItem>
      )}
      {mark !== "pie" && chart.showGrid !== false ? (
        <>
          <DropdownMenuSwitchItem
            checked={chart.gridVertical === true}
            onCheckedChange={(next) => {
              write({ gridVertical: next });
            }}
          >
            Vertical grid
          </DropdownMenuSwitchItem>
          <RadioSubmenu
            currentLabel={chart.gridCount ? String(chart.gridCount) : "Auto"}
            label="Grid line count"
            onValueChange={(value) => {
              write({
                gridCount: value === "auto" ? undefined : Number(value),
              });
            }}
            options={GRID_COUNT_OPTIONS}
            value={chart.gridCount ? String(chart.gridCount) : "auto"}
          />
        </>
      ) : null}
    </>
  );
}

/**
 * Per-series (or per-slice, for pie) color rows: label + a token swatch that
 * cycles `--chart-1..5` on click. Rendered inside a `ChartPaletteScope` so
 * swatches preview the chart's own palette.
 */
function ChartColorRows({
  chart,
  isPie,
  paletteId,
  targets,
  write,
}: {
  chart: ChartViewConfig;
  isPie: boolean;
  paletteId: ChartPaletteId | undefined;
  targets: { key: string; label: string }[];
  write: WriteChartPatch;
}): ReactNode {
  if (targets.length === 0) {
    return null;
  }
  return (
    <>
      <DropdownMenuSeparator />
      <p className="px-2 pt-1.5 pb-0.5 text-muted-foreground text-xs">
        {isPie ? "Slice colors" : "Series colors"}
      </p>
      <ChartPaletteScope palette={paletteId}>
        <div className="max-h-44 overflow-y-auto">
          {targets.map((target, index) => {
            const effective = chartTokenIndex(
              chartColorOverride(chart, target.key),
              index
            );
            return (
              <div
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm"
                key={target.key === "" ? "__empty" : target.key}
              >
                <span className="min-w-0 flex-1 truncate">{target.label}</span>
                <button
                  aria-label={`Change color for ${target.label}`}
                  className="shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    write({
                      colorOverrides: cycledColorOverrides(
                        chart.colorOverrides,
                        target.key,
                        effective
                      ),
                    });
                  }}
                  title="Click to cycle through the palette colors"
                  type="button"
                >
                  <span
                    className="block size-4 rounded-sm ring-1 ring-foreground/10"
                    style={{
                      backgroundColor: `var(--chart-${String(effective)})`,
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </ChartPaletteScope>
    </>
  );
}

/**
 * Time-axis chart controls (X-mode = Time): the captured number property, the
 * visible window, and the Y scale (absolute vs % change). Extracted so the main
 * options function stays under the complexity budget.
 */
function TimeAxisOptions({
  chart,
  fields,
  write,
}: {
  chart: ChartViewConfig;
  fields: readonly DatabaseField[];
  write: WriteChartPatch;
}): ReactNode {
  // Only fields that actually record history over time (local capture +
  // connector backfill) can plot a time series — offering a plain number field
  // would draw the wrong data (the backfill is the captured field's, e.g.
  // price) under that field's formatter.
  const timeFieldCandidates = fields.filter(
    (field) => field.type === "number" && field.captureHistory === true
  );
  const firstTimeFieldId = timeFieldCandidates[0]?.id;
  const currentWindowMs = chart.timeSeries?.windowMs ?? DEFAULT_TIME_WINDOW_MS;
  const currentWindowId = presetForWindow(currentWindowMs).id;
  const currentScale = chart.timeSeries?.scale ?? "absolute";
  const fieldName = (fieldId: string | undefined): string =>
    fields.find((field) => field.id === fieldId)?.name ?? "None";

  return (
    <>
      <RadioSubmenu
        currentLabel={fieldName(chart.timeSeries?.fieldId)}
        label="Time property"
        onValueChange={(value) => {
          write({ timeSeries: { ...chart.timeSeries, fieldId: value } });
        }}
        options={timeFieldCandidates.map(fieldOption)}
        value={chart.timeSeries?.fieldId ?? ""}
      />
      <RadioSubmenu
        currentLabel={currentWindowId}
        label="Window"
        onValueChange={(value) => {
          const preset = TIME_WINDOW_PRESETS.find(
            (entry) => entry.id === value
          );
          const fieldId = chart.timeSeries?.fieldId ?? firstTimeFieldId;
          if (preset && fieldId) {
            write({
              timeSeries: {
                ...chart.timeSeries,
                fieldId,
                windowMs: preset.windowMs,
              },
            });
          }
        }}
        options={TIME_WINDOW_PRESETS.map((preset) => ({
          value: preset.id,
          label: preset.label,
        }))}
        value={currentWindowId}
      />
      <RadioSubmenu
        currentLabel={currentScale === "percent" ? "% change" : "Absolute"}
        label="Scale"
        onValueChange={(value) => {
          const fieldId = chart.timeSeries?.fieldId ?? firstTimeFieldId;
          if (fieldId) {
            write({
              timeSeries: {
                ...chart.timeSeries,
                fieldId,
                scale: value === "percent" ? "percent" : "absolute",
              },
            });
          }
        }}
        options={[
          { value: "absolute", label: "Absolute" },
          { value: "percent", label: "% change" },
        ]}
        value={currentScale}
      />
    </>
  );
}

export interface ChartOptionsItemsProps {
  /** Current chart dataset — series/category color rows derive from it. */
  data: ChartData;
  database: LocalDatabase;
  fields: readonly DatabaseField[];
  view: DatabaseView;
}

/**
 * The chart settings rows themselves, mounted directly inside a
 * `DropdownMenuSubContent` (the ⋯ menu's "Chart" submenu). No trigger /
 * content wrapper of its own.
 */
export function ChartOptionsItems({
  data,
  database,
  fields,
  view,
}: ChartOptionsItemsProps): ReactNode {
  const chart = view.config.chart ?? {};
  const mark = chart.mark ?? DEFAULT_CHART_MARK;
  const aggregate = chart.yAggregate ?? DEFAULT_CHART_Y_AGGREGATE;
  const isPie = mark === "pie";
  const paletteId = resolveChartPaletteId(chart.palette);

  const write = (patch: Partial<ChartViewConfig>) => {
    updateDatabaseView(database.id, view.id, chartConfigPatch(view, patch));
  };

  const xOptions = chartXFieldCandidates(fields).map(fieldOption);
  const yOptions = chartYFieldCandidates(fields).map(fieldOption);
  const seriesOptions: RadioSubmenuOption[] = [
    { value: NONE_VALUE, label: "None" },
    ...xOptions,
  ];
  const aggregateOptions: RadioSubmenuOption[] = CHART_Y_AGGREGATES.map(
    (value) => ({ value, label: CHART_Y_AGGREGATE_LABELS[value] })
  );
  const paletteOptions: RadioSubmenuOption[] = [
    { value: NONE_VALUE, label: "Default" },
    ...CHART_PALETTE_IDS.map((id) => ({
      value: id,
      label: CHART_PALETTES[id].label,
      leading: <PaletteSwatch palette={id} />,
    })),
  ];

  const fieldName = (fieldId: string | undefined): string =>
    fields.find((field) => field.id === fieldId)?.name ?? "None";

  // Time-axis controls: plot a captured number field over a continuous time
  // axis, one series per synced row.
  const isTime = chart.xMode === "time";
  const xModeOptions: RadioSubmenuOption[] = [
    { value: "category", label: "Category" },
    { value: "time", label: "Time" },
  ];

  // Color override rows: pie recolors slices (keyed by category bucket key),
  // cartesian marks recolor series (keyed by series key).
  const colorTargets = isPie
    ? data.categories.map((label, index) => ({
        key: data.categoryKeys[index],
        label,
      }))
    : data.series.map((series) => ({ key: series.key, label: series.label }));
  const legendDefault = isPie
    ? data.categories.length > 1
    : data.series.length > 1;
  const showLegend = chart.showLegend ?? legendDefault;

  return (
    <>
      <div className="p-1">
        <MarkPicker mark={mark} write={write} />
      </div>
      <DropdownMenuSeparator />
      <RadioSubmenu
        currentLabel={isTime ? "Time" : "Category"}
        label="X axis mode"
        onValueChange={(value) => {
          write({ xMode: value === "time" ? "time" : "category" });
        }}
        options={xModeOptions}
        value={isTime ? "time" : "category"}
      />
      {isTime ? (
        <TimeAxisOptions chart={chart} fields={fields} write={write} />
      ) : (
        <>
          <RadioSubmenu
            currentLabel={fieldName(chart.xFieldId)}
            label="X axis"
            onValueChange={(value) => {
              write({ xFieldId: value });
            }}
            options={xOptions}
            value={chart.xFieldId ?? ""}
          />
          <RadioSubmenu
            currentLabel={CHART_Y_AGGREGATE_LABELS[aggregate]}
            label="Y value"
            onValueChange={(value) => {
              write({ yAggregate: value as ChartViewConfig["yAggregate"] });
            }}
            options={aggregateOptions}
            value={aggregate}
          />
          {aggregate === "count" ? null : (
            <RadioSubmenu
              currentLabel={fieldName(chart.yFieldId)}
              label="Y property"
              onValueChange={(value) => {
                write({ yFieldId: value });
              }}
              options={yOptions}
              value={chart.yFieldId ?? ""}
            />
          )}
          {isPie ? null : (
            <RadioSubmenu
              currentLabel={fieldName(chart.seriesFieldId)}
              label="Series"
              onValueChange={(value) => {
                write({
                  seriesFieldId: value === NONE_VALUE ? undefined : value,
                });
              }}
              options={seriesOptions}
              value={chart.seriesFieldId ?? NONE_VALUE}
            />
          )}
        </>
      )}
      <DropdownMenuSeparator />
      <ChartToggleItems
        chart={chart}
        mark={mark}
        showLegend={showLegend}
        write={write}
      />
      <DropdownMenuSeparator />
      <RadioSubmenu
        currentLabel={paletteId ? CHART_PALETTES[paletteId].label : "Default"}
        label="Palette"
        onValueChange={(value) => {
          write({ palette: value === NONE_VALUE ? undefined : value });
        }}
        options={paletteOptions}
        value={paletteId ?? NONE_VALUE}
      />
      <ChartColorRows
        chart={chart}
        isPie={isPie}
        paletteId={paletteId}
        targets={colorTargets}
        write={write}
      />
    </>
  );
}
