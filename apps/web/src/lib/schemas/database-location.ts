/**
 * @fileoverview Zod schema for a `location` cell value.
 *
 * Its own module, like `database-map-config.ts`, so the core `database.ts`
 * schema stays readable as one document.
 *
 * The stored shape is `{ label, lat?, lng? }`: the label is the address or
 * place name a person typed and what every non-map surface (grid text,
 * filters, sorts, formulas, search) reads; the coordinates are what a map
 * plots. Coordinates are optional because a label exists before anything can
 * resolve it — typed offline, or the geocode proxy is unconfigured — and an
 * unresolved location is honest data rather than a write to reject. The flat
 * shape cannot express "both or neither", so readers must go through
 * `locationCoordinate` in `lib/databases/location-values.ts`, which drops a
 * half-pair.
 */
import { z } from "zod";

export const databaseLocationValueSchema = z.object({
  /** Latitude of the resolved point; absent until the label is geocoded. */
  lat: z.number().optional(),
  /** Address or place name — the cell's display text. */
  label: z.string(),
  /** Longitude of the resolved point; absent until the label is geocoded. */
  lng: z.number().optional(),
});

export type DatabaseLocationValue = z.infer<typeof databaseLocationValueSchema>;
