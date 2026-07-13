/**
 * Central sink for local-persistence failures (TanStack DB commit rejections,
 * localStorage quota errors). Collection ops report here instead of swallowing;
 * `reportPersistenceError` surfaces a Sonner toast so the user learns edits
 * stopped saving.
 */

import { appToast } from "@/lib/toast/app-toast.ts";
import { TOAST_ID_PERSISTENCE_ERROR } from "@/lib/toast/toast-ids.ts";

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function persistenceMessage(kind: "quota" | "unknown"): string {
  return kind === "quota"
    ? "Local storage is full — recent edits are not being saved. Free up space or export your pages."
    : "Saving locally failed — recent edits may not persist.";
}

export function reportPersistenceError(error: unknown): void {
  console.error("[persistence] local save failed", error);
  const kind = isQuotaError(error) ? "quota" : "unknown";
  appToast.error(persistenceMessage(kind), {
    duration: Number.POSITIVE_INFINITY,
    id: TOAST_ID_PERSISTENCE_ERROR,
  });
}
