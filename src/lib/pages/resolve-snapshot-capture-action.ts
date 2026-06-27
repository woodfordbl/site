import type {
  PageSnapshotDescriptor,
  PageSnapshotIndex,
} from "@/lib/pages/page-snapshot-types.ts";

export type SnapshotCaptureAction =
  | { kind: "skip" }
  | { kind: "create"; descriptor: PageSnapshotDescriptor }
  | { kind: "update"; descriptor: PageSnapshotDescriptor };

function isUnchanged(
  descriptor: PageSnapshotDescriptor,
  candidate: Omit<PageSnapshotDescriptor, "id">
): boolean {
  return (
    descriptor.contentHash === candidate.contentHash &&
    descriptor.metadataHash === candidate.metadataHash
  );
}

/**
 * Decides whether a fresh capture should update the current 10-minute bucket's
 * checkpoint, create a new one, or be skipped as a no-op.
 *
 * - Same bucket as the latest checkpoint → coalesce (UPDATE in place), unless
 *   the content + metadata are unchanged → SKIP.
 * - New bucket → CREATE, unless the content + metadata still match the latest
 *   checkpoint (a no-op edit that merely crossed a bucket boundary) → SKIP.
 */
export function resolveSnapshotCaptureAction(
  index: PageSnapshotIndex,
  candidate: Omit<PageSnapshotDescriptor, "id">,
  newId: string
): SnapshotCaptureAction {
  const latest = index.descriptors.at(-1);

  if (!latest) {
    return { kind: "create", descriptor: { ...candidate, id: newId } };
  }

  if (latest.bucketId === candidate.bucketId) {
    if (isUnchanged(latest, candidate)) {
      return { kind: "skip" };
    }
    return { kind: "update", descriptor: { ...candidate, id: latest.id } };
  }

  if (isUnchanged(latest, candidate)) {
    return { kind: "skip" };
  }

  return { kind: "create", descriptor: { ...candidate, id: newId } };
}
