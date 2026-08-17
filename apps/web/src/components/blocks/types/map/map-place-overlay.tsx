"use client";

import { IconDots, IconMapPin, IconMapPinOff } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { DatabaseField } from "@/lib/schemas/database.ts";

/**
 * @fileoverview What a property-bound `map` block says about itself, and how
 * to change it: the place's own address, and a ⋯ menu in the block's top-left
 * corner.
 *
 * It reads as an address rather than "Following Place" because the address is
 * the useful fact — which property supplies it is a detail of how the block
 * was set up, and belongs in the menu that changes it. The chrome is the
 * overlay idiom the camera controls already use in the opposite corner, so a
 * bound block gains a corner control rather than a bar above the map.
 *
 * Sits above the map (or above the notice a bound block with no coordinates
 * shows) so it is reachable in every state — including the states where
 * unbinding is the only way out.
 */

export interface MapPlaceMenuItemsProps {
  /** Location properties on the host row, for switching the binding. */
  locationFields: readonly DatabaseField[];
  onFollowField: (fieldId: string) => void;
  onStopFollowing: () => void;
  /** The property currently followed; absent once it has been deleted. */
  selectedFieldId?: string;
}

/**
 * Everything the ⋯ menu offers. Unbinding is listed unconditionally — a block
 * whose property was deleted has no other way back to a placeholder.
 */
export function MapPlaceMenuItems({
  locationFields,
  onFollowField,
  onStopFollowing,
  selectedFieldId,
}: MapPlaceMenuItemsProps): ReactNode {
  return (
    <>
      {locationFields.length > 0 ? (
        <>
          <DropdownMenuRadioGroup
            onValueChange={onFollowField}
            value={selectedFieldId ?? ""}
          >
            <DropdownMenuLabel>Follow a property</DropdownMenuLabel>
            {locationFields.map((field) => (
              <DropdownMenuRadioItem key={field.id} value={field.id}>
                {field.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
        </>
      ) : null}
      <DropdownMenuItem onClick={onStopFollowing}>
        <IconMapPinOff />
        Stop following
      </DropdownMenuItem>
    </>
  );
}

export interface MapPlaceOverlayProps extends MapPlaceMenuItemsProps {
  /** Resolved address, or the state the binding is in. */
  label: string;
}

export function MapPlaceOverlay({
  label,
  locationFields,
  onFollowField,
  onStopFollowing,
  selectedFieldId,
}: MapPlaceOverlayProps): ReactNode {
  return (
    <ButtonGroup
      // Leaves the top-right camera controls clear on a narrow block.
      className="absolute top-3 left-3 z-10 max-w-[calc(100%-5.5rem)]"
      variant="overlay"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          nativeButton
          render={
            <Button
              aria-label="Location options"
              size="icon-xs"
              type="button"
              variant="overlayItem"
            />
          }
        >
          <IconDots aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <MapPlaceMenuItems
            locationFields={locationFields}
            onFollowField={onFollowField}
            onStopFollowing={onStopFollowing}
            selectedFieldId={selectedFieldId}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="flex min-w-0 items-center gap-1 pr-2 pl-0.5 text-muted-foreground text-xs">
        <IconMapPin aria-hidden className="size-3.5 shrink-0 stroke-[1.5px]" />
        <span className="min-w-0 truncate">{label}</span>
      </span>
    </ButtonGroup>
  );
}
