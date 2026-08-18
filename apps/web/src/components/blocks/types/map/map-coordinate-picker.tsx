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
} from "@/lib/databases/location-values.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

/**
 * @fileoverview Where a `map` block gets its place: a row property to follow,
 * or a coordinate pinned into the block.
 *
 * Following a property comes first when the host page is a database row or a
 * row template, because that is the answer on those pages — the block then
 * draws each row's own location instead of one fixed pin. Coordinate entry
 * stays below it and works anywhere, offline, with no geocoder involved (the
 * `location` cell editor is where address search lives).
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

/** Row properties this block can follow, listed above coordinate entry. */
function FollowPropertyList({
  fields,
  onFollowField,
}: {
  fields: readonly DatabaseField[];
  onFollowField: (fieldId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 border-border border-b pb-2">
      <p className="px-1 text-muted-foreground text-xs">Follow a property</p>
      {fields.map((field) => (
        <Button
          className="justify-start"
          key={field.id}
          onClick={() => onFollowField(field.id)}
          size="sm"
          variant="ghost"
        >
          <IconMapPin className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
          <span className="min-w-0 truncate">{field.name}</span>
        </Button>
      ))}
    </div>
  );
}

interface MapCoordinatePickerProps {
  children: ReactElement;
  /** Location properties of the host row, empty off a row/template page. */
  locationFields?: readonly DatabaseField[];
  onFollowField?: (fieldId: string) => void;
  onOpenChange?: (open: boolean) => void;
  onSubmit: (coordinate: MapCoordinate) => void;
  open?: boolean;
}

export function MapCoordinatePicker({
  children,
  locationFields,
  onFollowField,
  onOpenChange,
  onSubmit,
  open,
}: MapCoordinatePickerProps) {
  const followable = locationFields ?? [];
  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger render={children} />
      <PopoverContent className="w-80" finalFocus={false} initialFocus={false}>
        <div className="flex flex-col gap-2">
          {followable.length > 0 && onFollowField ? (
            <FollowPropertyList
              fields={followable}
              onFollowField={onFollowField}
            />
          ) : null}
          <MapCoordinatePanel onSubmit={onSubmit} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
