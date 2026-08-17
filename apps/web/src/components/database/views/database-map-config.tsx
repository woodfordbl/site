import { IconChartBubble, IconMapPin, IconWorld } from "@tabler/icons-react";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";

import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { mapConfigPatch } from "@/components/database/views/database-map-config-helpers.ts";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
} from "@/components/ui/dropdown-menu.tsx";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group.tsx";
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
  resolveChartPaletteId,
} from "@/lib/databases/chart-data.ts";
import {
  type DatabaseMapConfig,
  type DatabaseMapMark,
  type DatabaseMapPointMode,
  type DatabaseMapScale,
  type DatabaseMapValueAggregate,
  DEFAULT_MAP_JOIN_PROPERTY,
  DEFAULT_MAP_MARK,
  DEFAULT_MAP_SCALE,
  DEFAULT_MAP_VALUE_AGGREGATE,
  isPointMark,
  mapColorFieldCandidates,
  mapCoordinateFieldCandidates,
  mapJoinFieldCandidates,
  mapLatLngFieldCandidates,
  mapLocationFieldCandidates,
  mapValueFieldCandidates,
  resolveMapMark,
  resolveMapPointMode,
} from "@/lib/databases/map-data.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabase,
} from "@/lib/schemas/database.ts";

/**
 * @fileoverview Map settings menu items (mark, location source, label/color fields, region
 * join + aggregate, palette, tooltip), rendered inside the database ⋯ settings
 * menu's "Map options" submenu — NOT a floating gear, so every view's options
 * live in one place. Every write shallow-merges through `mapConfigPatch` →
 * `updateDatabaseView`, following the settings-menu patch conventions.
 */

const MARK_OPTIONS: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: DatabaseMapMark;
}[] = [
  { value: "pins", label: "Pins", icon: IconMapPin },
  { value: "cluster", label: "Clusters", icon: IconChartBubble },
  { value: "region", label: "Regions", icon: IconWorld },
];

const POINT_MODE_OPTIONS: { label: string; value: DatabaseMapPointMode }[] = [
  { value: "location", label: "A location property" },
  { value: "pair", label: "Two number properties" },
  { value: "coordinate", label: 'One "lat, lng" property' },
];

const SCALE_OPTIONS: { label: string; value: DatabaseMapScale }[] = [
  { value: "linear", label: "Linear" },
  { value: "quantile", label: "Quantile" },
];

/** Radio value for "no selection" slots (label/color None, palette Default). */
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
        <span className="min-w-0 flex-1 truncate pl-3 text-right text-muted-foreground text-xs">
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

/** Live five-dot preview of a palette (same idiom as the chart options). */
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

/** Field picker option with the field's (custom or type) icon. */
function fieldOption(field: DatabaseField): RadioSubmenuOption {
  const FieldIcon = resolveFieldIcon(field);
  return {
    value: field.id,
    label: field.name,
    leading: <FieldIcon className="size-4 shrink-0 stroke-[1.5px]" />,
  };
}

function fieldName(
  fields: readonly DatabaseField[],
  fieldId: string | undefined,
  fallback: string
): string {
  const field = fields.find((entry) => entry.id === fieldId);
  return field ? field.name : fallback;
}

type WriteMapPatch = (patch: Partial<DatabaseMapConfig>) => void;

/**
 * Keep typing inside menu-embedded inputs from triggering the menu's
 * typeahead/arrow navigation; Escape still propagates so it closes the menu.
 */
function stopMenuKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

/** Feature-property input for the region join; empty resets to the default. */
function JoinPropertyInput({
  onCommit,
  value,
}: {
  onCommit: (property: string | undefined) => void;
  value: string | undefined;
}): ReactNode {
  const commit = (raw: string) => {
    const trimmed = raw.trim();
    const next = trimmed === "" ? undefined : trimmed;
    if (next !== value) {
      onCommit(next);
    }
  };
  return (
    <InputGroup className="h-8 pointer-coarse:h-10">
      <InputGroupInput
        aria-label="Match feature property"
        autoComplete="off"
        defaultValue={value ?? ""}
        onBlur={(event) => {
          commit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          stopMenuKeys(event);
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget.value);
          }
        }}
        placeholder={DEFAULT_MAP_JOIN_PROPERTY}
      />
    </InputGroup>
  );
}

/** The field picker(s) the chosen point mode needs. */
function PointFieldItems({
  fields,
  map,
  numberFields,
  pointMode,
  write,
}: {
  fields: DatabaseField[];
  map: DatabaseMapConfig;
  numberFields: DatabaseField[];
  pointMode: DatabaseMapPointMode;
  write: WriteMapPatch;
}): ReactNode {
  if (pointMode === "location") {
    return (
      <RadioSubmenu
        currentLabel={fieldName(fields, map.locationFieldId, "None")}
        label="Location"
        onValueChange={(value) => {
          write({ locationFieldId: value });
        }}
        options={mapLocationFieldCandidates(fields).map(fieldOption)}
        value={map.locationFieldId ?? NONE_VALUE}
      />
    );
  }
  if (pointMode === "coordinate") {
    return (
      <RadioSubmenu
        currentLabel={fieldName(fields, map.coordFieldId, "None")}
        label="Coordinates"
        onValueChange={(value) => {
          write({ coordFieldId: value });
        }}
        options={mapCoordinateFieldCandidates(fields).map(fieldOption)}
        value={map.coordFieldId ?? NONE_VALUE}
      />
    );
  }
  return (
    <>
      <RadioSubmenu
        currentLabel={fieldName(fields, map.latFieldId, "None")}
        label="Latitude"
        onValueChange={(value) => {
          write({ latFieldId: value });
        }}
        options={numberFields.map(fieldOption)}
        value={map.latFieldId ?? NONE_VALUE}
      />
      <RadioSubmenu
        currentLabel={fieldName(fields, map.lngFieldId, "None")}
        label="Longitude"
        onValueChange={(value) => {
          write({ lngFieldId: value });
        }}
        options={numberFields.map(fieldOption)}
        value={map.lngFieldId ?? NONE_VALUE}
      />
    </>
  );
}

/**
 * Marker-tooltip rows: what the hover card shows besides its title. Mirrors a
 * board card's properties list — a switch per property, plus the row icon —
 * and only appears while tooltips are on, since nothing below it applies
 * otherwise.
 */
function TooltipItems({
  fields,
  map,
  write,
}: {
  fields: DatabaseField[];
  map: DatabaseMapConfig;
  write: WriteMapPatch;
}): ReactNode {
  const selected = map.tooltipFieldIds ?? [];

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <span className="shrink-0">Tooltip properties</span>
          <span className="min-w-0 flex-1 truncate pl-3 text-right text-muted-foreground text-xs">
            {selected.length === 0 ? "None" : selected.length}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {fields.map((field) => {
            const FieldIcon = resolveFieldIcon(field);
            return (
              <DropdownMenuSwitchItem
                checked={selected.includes(field.id)}
                key={field.id}
                onCheckedChange={(checked) => {
                  // Toggling appends, so the list keeps the order they were
                  // added in — a menu of switches has no way to reorder.
                  write({
                    tooltipFieldIds: checked
                      ? [...selected, field.id]
                      : selected.filter((id) => id !== field.id),
                  });
                }}
              >
                <FieldIcon className="size-4 shrink-0 stroke-[1.5px]" />
                <span className="min-w-0 flex-1 truncate">{field.name}</span>
              </DropdownMenuSwitchItem>
            );
          })}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSwitchItem
        checked={map.showTooltipIcon !== false}
        onCheckedChange={(checked) => {
          write({ showTooltipIcon: checked });
        }}
      >
        Tooltip icon
      </DropdownMenuSwitchItem>
    </>
  );
}

/** Location-source rows for the point marks (pins / clusters). */
function PointSourceItems({
  fields,
  map,
  write,
}: {
  fields: DatabaseField[];
  map: DatabaseMapConfig;
  write: WriteMapPatch;
}): ReactNode {
  const pointMode = resolveMapPointMode(map);
  const numberFields = mapLatLngFieldCandidates(fields);

  return (
    <>
      <RadioSubmenu
        currentLabel={
          POINT_MODE_OPTIONS.find((option) => option.value === pointMode)
            ?.label ?? ""
        }
        label="Location from"
        onValueChange={(value) => {
          write({ pointMode: value as DatabaseMapPointMode });
        }}
        options={POINT_MODE_OPTIONS}
        value={pointMode}
      />
      <PointFieldItems
        fields={fields}
        map={map}
        numberFields={numberFields}
        pointMode={pointMode}
        write={write}
      />
      <RadioSubmenu
        currentLabel={fieldName(fields, map.labelFieldId, "Title")}
        label="Label"
        onValueChange={(value) => {
          write({ labelFieldId: value === NONE_VALUE ? undefined : value });
        }}
        options={[
          { value: NONE_VALUE, label: "Title" },
          ...fields.map(fieldOption),
        ]}
        value={map.labelFieldId ?? NONE_VALUE}
      />
      <RadioSubmenu
        currentLabel={fieldName(fields, map.colorFieldId, "None")}
        label="Color by"
        onValueChange={(value) => {
          write({ colorFieldId: value === NONE_VALUE ? undefined : value });
        }}
        options={[
          { value: NONE_VALUE, label: "None" },
          ...mapColorFieldCandidates(fields).map(fieldOption),
        ]}
        value={map.colorFieldId ?? NONE_VALUE}
      />
    </>
  );
}

/** Join + aggregate rows for the region (choropleth) mark. */
function RegionSourceItems({
  fields,
  map,
  write,
}: {
  fields: DatabaseField[];
  map: DatabaseMapConfig;
  write: WriteMapPatch;
}): ReactNode {
  const aggregate = map.valueAggregate ?? DEFAULT_MAP_VALUE_AGGREGATE;
  const scale = map.scale ?? DEFAULT_MAP_SCALE;

  return (
    <>
      <RadioSubmenu
        currentLabel={fieldName(fields, map.joinFieldId, "None")}
        label="Region code"
        onValueChange={(value) => {
          write({ joinFieldId: value });
        }}
        options={mapJoinFieldCandidates(fields).map(fieldOption)}
        value={map.joinFieldId ?? NONE_VALUE}
      />
      <div className="px-1 py-1">
        <JoinPropertyInput
          onCommit={(property) => {
            write({ joinProperty: property });
          }}
          value={map.joinProperty}
        />
        <p className="px-1 pt-1 text-muted-foreground text-xs">
          Feature property to match — {DEFAULT_MAP_JOIN_PROPERTY} or NAME on the
          bundled world countries.
        </p>
      </div>
      <RadioSubmenu
        currentLabel={CHART_Y_AGGREGATE_LABELS[aggregate]}
        label="Value"
        onValueChange={(value) => {
          write({ valueAggregate: value as DatabaseMapValueAggregate });
        }}
        options={CHART_Y_AGGREGATES.map((entry) => ({
          value: entry,
          label: CHART_Y_AGGREGATE_LABELS[entry],
        }))}
        value={aggregate}
      />
      {aggregate === "count" ? null : (
        <RadioSubmenu
          currentLabel={fieldName(fields, map.valueFieldId, "None")}
          label="Value property"
          onValueChange={(value) => {
            write({ valueFieldId: value });
          }}
          options={mapValueFieldCandidates(fields).map(fieldOption)}
          value={map.valueFieldId ?? NONE_VALUE}
        />
      )}
      <RadioSubmenu
        currentLabel={
          SCALE_OPTIONS.find((option) => option.value === scale)?.label ?? ""
        }
        label="Scale"
        onValueChange={(value) => {
          write({ scale: value as DatabaseMapScale });
        }}
        options={SCALE_OPTIONS}
        value={scale}
      />
    </>
  );
}

export interface MapOptionsItemsProps {
  database: LocalDatabase;
  fields: DatabaseField[];
  view: DatabaseView;
}

export function MapOptionsItems({
  database,
  fields,
  view,
}: MapOptionsItemsProps): ReactNode {
  const map = view.config.map ?? {};
  const mark = resolveMapMark(map);
  const palette = resolveChartPaletteId(map.palette);
  const showTooltip = map.showTooltip ?? true;

  const write: WriteMapPatch = (patch) => {
    updateDatabaseView(database.id, view.id, mapConfigPatch(view, patch));
  };

  return (
    <>
      <DropdownMenuRadioGroup
        onValueChange={(value) => {
          write({ mark: value as DatabaseMapMark });
        }}
        value={mark ?? DEFAULT_MAP_MARK}
      >
        {MARK_OPTIONS.map((option) => (
          <DropdownMenuRadioItem key={option.value} value={option.value}>
            <option.icon className="size-4 shrink-0 stroke-[1.5px]" />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      {isPointMark(mark) ? (
        <PointSourceItems fields={fields} map={map} write={write} />
      ) : (
        <RegionSourceItems fields={fields} map={map} write={write} />
      )}
      <DropdownMenuSeparator />
      <RadioSubmenu
        currentLabel={palette ? CHART_PALETTES[palette].label : "Default"}
        label="Palette"
        onValueChange={(value) => {
          write({ palette: value === NONE_VALUE ? undefined : value });
        }}
        options={[
          { value: NONE_VALUE, label: "Default" },
          ...CHART_PALETTE_IDS.map((id) => ({
            value: id,
            label: CHART_PALETTES[id].label,
            leading: <PaletteSwatch palette={id} />,
          })),
        ]}
        value={map.palette ?? NONE_VALUE}
      />
      <DropdownMenuSwitchItem
        checked={showTooltip}
        onCheckedChange={(checked) => {
          write({ showTooltip: checked });
        }}
      >
        Show tooltip
      </DropdownMenuSwitchItem>
      {/* Only `pins` draws marker cards: clusters aggregate rows into bubbles
          and regions have their own aggregate readout. */}
      {showTooltip && mark === "pins" ? (
        <TooltipItems fields={fields} map={map} write={write} />
      ) : null}
    </>
  );
}
