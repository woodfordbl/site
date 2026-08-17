import { IconMapPin, IconSearch } from "@tabler/icons-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { CellEditorPopover } from "@/components/database/database-cell-editor-popover.tsx";
import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { updateDatabaseCell } from "@/db/queries/database-collection-ops.ts";
import {
  formatCoordinateText,
  type MapCoordinate,
  normalizeLocationValue,
  parseCoordinateText,
} from "@/lib/databases/location-values.ts";
import {
  type GeocodeResult,
  searchGeocode,
} from "@/lib/geocode/geocode-search.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";
import type { DatabaseLocationValue } from "@/lib/schemas/database-location.ts";

/**
 * @fileoverview Location cell editor: type an address and pick a place, or
 * enter coordinates directly.
 *
 * Two entry paths, because only one of them needs a network. A typed "lat, lng"
 * is recognised as you type and committed on Enter with no request at all; any
 * other text is searched against the geocode proxy on submit (never per
 * keystroke — `lib/geocode/geocode-search.ts` explains why) and commits when a
 * result is picked. A search that fails says so and leaves the typed text
 * committable as an unresolved label, so a place is always enterable: the row
 * keeps the address it means and the map view counts it among the rows it
 * cannot plot.
 */

interface LocationCellPopoverEditorProps {
  /** Override where commits land (row-template defaults have no row). */
  commitValueOverride?: (value: DatabaseCellValue | null) => void;
  field: Extract<DatabaseField, { type: "location" }>;
  onStopEdit: () => void;
  rowId: string;
  value: DatabaseCellValue | undefined;
}

type SearchState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "results"; results: GeocodeResult[] }
  | { kind: "error"; message: string };

export function LocationCellPopoverEditor({
  commitValueOverride,
  field,
  onStopEdit,
  rowId,
  value,
}: LocationCellPopoverEditorProps): ReactNode {
  const current = normalizeLocationValue(value);
  const [draft, setDraft] = useState(current?.label ?? "");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const focusOnMount = useFocusOnMount({ select: true });
  const abortRef = useRef<AbortController | null>(null);

  // A superseded or abandoned search must not resolve into an unmounted editor.
  useEffect(() => () => abortRef.current?.abort(), []);

  const write =
    commitValueOverride ??
    ((next: DatabaseCellValue | null) =>
      updateDatabaseCell(rowId, field.id, next));

  const commit = (next: DatabaseLocationValue | null) => {
    write(next);
    onStopEdit();
  };

  const typedCoordinate = parseCoordinateText(draft);

  const runSearch = async (): Promise<void> => {
    const term = draft.trim();
    if (term === "") {
      commit(null);
      return;
    }
    // Coordinates resolve themselves — no request, works offline.
    if (typedCoordinate) {
      commit({
        ...typedCoordinate,
        label: formatCoordinateText(typedCoordinate),
      });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: "searching" });
    const outcome = await searchGeocode(term, controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    setState(
      outcome.kind === "error"
        ? { kind: "error", message: outcome.message }
        : { kind: "results", results: outcome.results }
    );
  };

  // Fire-and-forget: every failure inside already lands in `state`, and an
  // abort is expected on unmount.
  const startSearch = () => {
    runSearch().catch(() => undefined);
  };

  return (
    <CellEditorPopover
      className="w-[max(var(--anchor-width),20rem)]"
      onStopEdit={onStopEdit}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <InputGroup className="h-8">
          <InputGroupAddon align="inline-start">
            <InputGroupText>
              <IconSearch />
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            aria-label={`${field.name} address or coordinates`}
            autoComplete="off"
            onChange={(event) => {
              setDraft(event.target.value);
              setState({ kind: "idle" });
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                startSearch();
              }
            }}
            placeholder="Address or lat, lng"
            ref={focusOnMount}
            value={draft}
          />
        </InputGroup>

        <LocationEditorBody
          coordinate={typedCoordinate}
          draft={draft}
          onPick={(result) =>
            commit({ label: result.label, lat: result.lat, lng: result.lng })
          }
          onSearch={startSearch}
          onUseLabel={() => commit({ label: draft.trim() })}
          state={state}
        />

        {current ? (
          <Button
            className="justify-center"
            onClick={() => commit(null)}
            size="sm"
            variant="ghost"
          >
            Clear
          </Button>
        ) : null}
      </div>
    </CellEditorPopover>
  );
}

/**
 * Everything below the input: the coordinate confirmation, the search results,
 * and the fallbacks when a search finds nothing or cannot run.
 */
function LocationEditorBody({
  coordinate,
  draft,
  onPick,
  onSearch,
  onUseLabel,
  state,
}: {
  coordinate: MapCoordinate | null;
  draft: string;
  onPick: (result: GeocodeResult) => void;
  onSearch: () => void;
  onUseLabel: () => void;
  state: SearchState;
}): ReactNode {
  if (coordinate) {
    return (
      <p className="px-2 pb-1 text-muted-foreground text-xs">
        Press Enter to drop a pin at {formatCoordinateText(coordinate)}.
      </p>
    );
  }
  if (state.kind === "searching") {
    return (
      <p className="px-2 pb-1 text-muted-foreground text-xs">Searching…</p>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-col gap-1">
        <p className="px-2 text-muted-foreground text-xs">{state.message}</p>
        <SaveLabelButton draft={draft} onUseLabel={onUseLabel} />
      </div>
    );
  }
  if (state.kind === "idle") {
    return (
      <div className="flex flex-col gap-1">
        <Button
          className="justify-center"
          disabled={draft.trim() === ""}
          onClick={onSearch}
          size="sm"
          variant="ghost"
        >
          Search for this place
        </Button>
      </div>
    );
  }
  if (state.results.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="px-2 text-muted-foreground text-xs">
          No places matched that search.
        </p>
        <SaveLabelButton draft={draft} onUseLabel={onUseLabel} />
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <div className="flex max-h-56 flex-col overflow-y-auto">
        {state.results.map((result) => (
          <button
            className="flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
            key={`${result.lat},${result.lng},${result.label}`}
            onClick={() => onPick(result)}
            type="button"
          >
            <IconMapPin className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{result.label}</span>
          </button>
        ))}
      </div>
      {/* OpenStreetMap's licence requires crediting the data behind results. */}
      <p className="px-2 pt-1 text-muted-foreground text-xs">
        Places from OpenStreetMap
      </p>
    </div>
  );
}

/** Commit the typed text as a label with no point — the offline fallback. */
function SaveLabelButton({
  draft,
  onUseLabel,
}: {
  draft: string;
  onUseLabel: () => void;
}): ReactNode {
  return (
    <Button
      className="justify-center"
      disabled={draft.trim() === ""}
      onClick={onUseLabel}
      size="sm"
      variant="ghost"
    >
      Save without coordinates
    </Button>
  );
}
