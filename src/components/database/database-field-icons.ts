import {
  IconAlignLeft,
  IconCalendar,
  IconCircleDot,
  IconHash,
  IconLink,
  IconList,
  IconSquareCheck,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

import type { DatabaseFieldType } from "@/lib/schemas/database.ts";

/**
 * Field-type icons shared by database surfaces outside the grid (filter bar,
 * pickers). The grid header keeps its own copy this wave; consolidation on
 * this map is deferred until the grid file is free to edit.
 */
export const DATABASE_FIELD_TYPE_ICONS: Record<
  DatabaseFieldType,
  ComponentType<{ className?: string }>
> = {
  text: IconAlignLeft,
  number: IconHash,
  checkbox: IconSquareCheck,
  select: IconCircleDot,
  multiSelect: IconList,
  date: IconCalendar,
  url: IconLink,
};
