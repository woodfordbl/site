import { z } from "zod";

/**
 * @fileoverview Page access levels (ReBAC). The level order is a strict
 * hierarchy — view < comment < edit < full_access — and every gate in the
 * client derives from that ranking, mirroring the server's `can_access`
 * (src/server/migrations/0001_functions_and_triggers.sql). `MyAccessRow` is the wire shape of
 * the `my_access` pseudo-shape (routes/api/sync/shape.get.ts): the signed-in
 * user's own effective level per accessible page, keyed by page id.
 */

export const ACCESS_LEVELS = [
  "view",
  "comment",
  "edit",
  "full_access",
] as const;

export type PageAccessLevel = (typeof ACCESS_LEVELS)[number];

export const pageAccessLevelSchema = z.enum(ACCESS_LEVELS);

/** One `my_access` shape row: the caller's effective level on one page. */
export const myAccessRowSchema = z.object({
  pageId: z.string(),
  level: pageAccessLevelSchema,
});

export type MyAccessRow = z.infer<typeof myAccessRowSchema>;

/** Human labels for the level pickers in the share dialog. */
export const ACCESS_LEVEL_LABELS: Record<PageAccessLevel, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  full_access: "Full access",
};

const LEVEL_RANK: Record<PageAccessLevel, number> = {
  view: 0,
  comment: 1,
  edit: 2,
  full_access: 3,
};

/** True when `level` grants at least `minimum` in the level hierarchy. */
export function accessAtLeast(
  level: PageAccessLevel,
  minimum: PageAccessLevel
): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minimum];
}

/**
 * True when a KNOWN level denies editing (view/comment). `null` means the page
 * has no `my_access` row — local mode, a shipped page outside the synced
 * domain, or a snapshot still loading — and is treated as ungoverned (not
 * read-only): revocation always deletes the page row itself, which unmounts
 * the page view, so null never masks a real denial.
 */
export function isReadOnlyAccessLevel(level: PageAccessLevel | null): boolean {
  return level !== null && !accessAtLeast(level, "edit");
}

/** Share management (the dialog and its endpoint) requires `full_access`. */
export function canManagePageSharing(level: PageAccessLevel | null): boolean {
  return level === "full_access";
}
