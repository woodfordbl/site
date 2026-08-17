import { IconMapPin } from "@tabler/icons-react";
import { useCallback, useRef, useState } from "react";

import { MapCoordinatePicker } from "@/components/blocks/types/map/map-coordinate-picker.tsx";
import { MapView } from "@/components/blocks/types/map/map-view.tsx";
import {
  useMapBlockLocationFields,
  useMapBlockPlace,
} from "@/components/blocks/types/map/use-map-block-place.ts";
import { Button } from "@/components/ui/button.tsx";
import { PlaceholderTrigger } from "@/components/ui/placeholder-trigger.tsx";
import { useAutoFocus } from "@/hooks/use-auto-focus.ts";
import { useInlineCustomBlockKeys } from "@/hooks/use-inline-custom-block-keys.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import type { MapCoordinate } from "@/lib/databases/location-values.ts";

type MapEditProps = BlockEditProps<"map">;

/** Zoom applied when a pin is first placed — street level, not the globe. */
const PLACED_ZOOM = 11;

export function MapEdit({
  autoFocus,
  onAutoFocusHandled,
  onChange,
  props,
  onExtendSelectionDown,
  onExtendSelectionUp,
  onMoveRowDown,
  onMoveRowUp,
  onNavigateDown,
  onNavigateUp,
  onStructuralKey,
}: MapEditProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const focusRef = useRef<HTMLButtonElement | HTMLDivElement>(null);
  const locationFields = useMapBlockLocationFields();
  const place = useMapBlockPlace(props);
  const isPlaceholder = place.kind === "empty";
  const followedField = locationFields.find(
    (field) => field.id === props.locationFieldId
  );

  const applyAutoFocus = useCallback(() => {
    focusRef.current?.focus();
    if (isPlaceholder) {
      setPickerOpen(true);
    }
    onAutoFocusHandled?.();
  }, [isPlaceholder, onAutoFocusHandled]);

  useAutoFocus({ enabled: autoFocus, onFocus: applyAutoFocus });

  const handleKeyDown = useInlineCustomBlockKeys({
    onExtendSelectionDown,
    onExtendSelectionUp,
    onMoveRowDown,
    onMoveRowUp,
    onNavigateDown,
    onNavigateUp,
    onStructuralKey,
  });

  // Placing a pin recenters on it; moving one on an already-placed map keeps
  // the reader's current camera, so a nudge doesn't jump the view.
  const placeCoordinate = useCallback(
    (coordinate: MapCoordinate, recenter: boolean) => {
      onChange({
        ...props,
        ...(recenter
          ? { center: [coordinate.lng, coordinate.lat], zoom: PLACED_ZOOM }
          : {}),
        markers: [{ lat: coordinate.lat, lng: coordinate.lng }],
      });
    },
    [onChange, props]
  );

  const handlePickFromMap = useCallback(
    (coordinate: MapCoordinate) => {
      placeCoordinate(coordinate, false);
    },
    [placeCoordinate]
  );

  if (isPlaceholder) {
    return (
      <MapCoordinatePicker
        locationFields={locationFields}
        onFollowField={(fieldId) => {
          // Frame it like a placed pin: a block pointed at one row's place
          // wants street level, not the world view a fresh block starts at.
          onChange({ ...props, locationFieldId: fieldId, zoom: PLACED_ZOOM });
          setPickerOpen(false);
        }}
        onOpenChange={setPickerOpen}
        onSubmit={(coordinate) => {
          placeCoordinate(coordinate, true);
          setPickerOpen(false);
        }}
        open={pickerOpen}
      >
        <PlaceholderTrigger
          icon={<IconMapPin />}
          onKeyDown={handleKeyDown}
          ref={focusRef as React.RefObject<HTMLButtonElement>}
        >
          Add a location
        </PlaceholderTrigger>
      </MapCoordinatePicker>
    );
  }

  return (
    // Visible focus target: keyboard users see where structural keys apply.
    // The frame hosts its own interactive children (map controls), so a
    // wrapping <button> would be invalid — a focusable group is correct.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: composite block focus surface for structural keys
    // biome-ignore lint/a11y/useSemanticElements: cannot be a <button>; contains interactive children
    <div
      aria-label="Map block"
      className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onKeyDown={handleKeyDown}
      ref={focusRef as React.RefObject<HTMLDivElement>}
      role="group"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the block itself is the keyboard target
      tabIndex={0}
    >
      {props.locationFieldId ? (
        <FollowedPropertyBar
          name={followedField?.name}
          onStopFollowing={() => {
            // Unbinding leaves the block a placeholder rather than resurrecting
            // a stale pin: the row's place was the point of following it.
            onChange({ ...props, locationFieldId: undefined, markers: [] });
          }}
        />
      ) : null}
      <MapView
        onPickCoordinate={props.locationFieldId ? undefined : handlePickFromMap}
        props={props}
      />
    </div>
  );
}

/** Edit-mode header for a bound block: what it follows, and how to stop. */
function FollowedPropertyBar({
  name,
  onStopFollowing,
}: {
  name: string | undefined;
  onStopFollowing: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 pb-1 text-muted-foreground text-xs">
      <IconMapPin className="size-3.5 shrink-0 stroke-[1.5px]" />
      <span className="min-w-0 truncate">
        Following {name ?? "a deleted property"}
      </span>
      <Button
        className="ml-auto h-6 px-2 text-xs"
        onClick={onStopFollowing}
        size="sm"
        variant="ghost"
      >
        Stop following
      </Button>
    </div>
  );
}
