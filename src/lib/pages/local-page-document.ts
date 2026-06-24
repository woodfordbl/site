import { localPagesCollection } from "@/db/collections/local-collections.ts";

/** True when a page has a live (non-deleted) local document in the collection. */
export function hasLocalPageDocument(pageId: string): boolean {
  return localPagesCollection.toArray.some(
    (localPage) => localPage.id === pageId && localPage.deletedAt == null
  );
}
