/**
 * @fileoverview `BlockSpec` for the `map` block, kept out of `registry.ts` so
 * the registry stays a flat table of entries rather than a growing wall of
 * inline literals.
 */
import { IconMapPin } from "@tabler/icons-react";

import { MapEdit } from "@/components/blocks/types/map/map-edit.tsx";
import { MapView } from "@/components/blocks/types/map/map-view.tsx";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import {
  type BlockSpec,
  INLINE_CUSTOM_CAPABILITIES,
} from "@/lib/canvas/block-spec.types.ts";

/** Standalone place-on-a-page block; data maps use a `database` map view. */
export const mapBlockSpec: BlockSpec<"map"> = {
  type: "map",
  label: "Map",
  slashAliases: ["map", "location", "place", "geo"],
  icon: IconMapPin,
  createDefault: () => createEmptyBlock("map"),
  behavior: {
    editStrategy: "inline-custom",
    capabilities: INLINE_CUSTOM_CAPABILITIES,
  },
  View: MapView,
  Edit: MapEdit,
};
