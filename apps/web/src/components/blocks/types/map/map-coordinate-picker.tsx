import { IconMapPin } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Field, FieldContent, FieldError } from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  type MapCoordinate,
  parseCoordinateText,
} from "@/lib/databases/map-data.ts";

/**
 * @fileoverview Coordinate entry for the `map` block. There is no geocoder here on purpose:
 * the app has no backend, and address search would mean a keyed third-party
 * service that 503s without its key. So the two ways to place a pin are
 * pasting "lat, lng" and clicking the map — both of which work offline.
 */

const COORDINATE_ERROR_MESSAGE =
  'Enter coordinates as "latitude, longitude" — e.g. 37.7749, -122.4194';

interface MapCoordinatePanelProps {
  onSubmit: (coordinate: MapCoordinate) => void;
}

function MapCoordinatePanel({ onSubmit }: MapCoordinatePanelProps) {
  const form = useForm({
    defaultValues: { coordinate: "" },
    onSubmit: ({ value }) => {
      const parsed = parseCoordinateText(value.coordinate);
      if (!parsed) {
        return;
      }
      onSubmit(parsed);
      form.reset();
    },
  });

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.Field name="coordinate">
        {(field) => {
          const showValidation = form.state.submissionAttempts > 0;
          const isInvalid =
            showValidation && parseCoordinateText(field.state.value) === null;

          return (
            <Field data-invalid={isInvalid || undefined}>
              <FieldContent>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <InputGroupText>
                      <IconMapPin aria-hidden />
                    </InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-invalid={isInvalid || undefined}
                    autoComplete="off"
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="37.7749, -122.4194"
                    value={field.state.value}
                  />
                </InputGroup>
                {isInvalid ? (
                  <FieldError>{COORDINATE_ERROR_MESSAGE}</FieldError>
                ) : null}
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.coordinate}>
        {(coordinate) => (
          <Button
            className="w-full"
            disabled={coordinate.trim().length === 0}
            type="submit"
          >
            Place pin
          </Button>
        )}
      </form.Subscribe>
      <p className="text-muted-foreground text-xs">
        Or place the map first and click it to drop a pin.
      </p>
    </form>
  );
}

interface MapCoordinatePickerProps {
  children: ReactElement;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (coordinate: MapCoordinate) => void;
  open?: boolean;
}

export function MapCoordinatePicker({
  children,
  onOpenChange,
  onSubmit,
  open,
}: MapCoordinatePickerProps) {
  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger render={children} />
      <PopoverContent className="w-80" finalFocus={false} initialFocus={false}>
        <MapCoordinatePanel onSubmit={onSubmit} />
      </PopoverContent>
    </Popover>
  );
}
